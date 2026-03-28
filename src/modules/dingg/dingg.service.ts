import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ExperienceCenter } from '../admin/entities/experience-center.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Order, OrderSource } from '../orders/entities/order.entity';
import { normalizePhone } from '../../common/utils/phone.util';

// ── DINGG API Types ──────────────────────────────────────────────────────

export interface DinggServiceItem {
    id: number;
    name: string;
    duration: number;
    price: number;
}

export interface DinggSlot {
    date: string;        // YYYY-MM-DD
    startTime: number;   // minutes from midnight (e.g. 600 = 10:00 AM)
    endTime: number;
    label: string;       // "10:00 AM"
    staffUuid?: string;
}

export class DinggBookingDto {
    leadId:      string;
    customerId:  string;
    serviceId:   number;
    serviceName: string;
    bookingDate: string;  // YYYY-MM-DD
    startTime:   number;
    endTime:     number;
    total:       number;
    staffUuid?:  string;
}

// ── Service ──────────────────────────────────────────────────────────────

@Injectable()
export class DinggIntegrationService {
    private readonly logger = new Logger(DinggIntegrationService.name);
    private readonly baseUrl: string;

    constructor(
        @InjectRepository(ExperienceCenter)
        private readonly ecRepo: Repository<ExperienceCenter>,
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(Order)
        private readonly orderRepo: Repository<Order>,
        private readonly configService: ConfigService,
        private readonly dataSource: DataSource,
    ) {
        this.baseUrl = this.configService.get<string>('DINGG_BASE_URL') ?? 'https://api.dingg.app';
    }

    // ── 1. Token Management (per-EC, cached in DB) ───────────────────────

    async getToken(ec: ExperienceCenter): Promise<string> {
        // Reload with secrets (they are select:false)
        const full = await this.ecRepo
            .createQueryBuilder('ec')
            .addSelect(['ec.dinggAccessCode', 'ec.dinggApiKey', 'ec.dinggToken'])
            .where('ec.id = :id', { id: ec.id })
            .getOne();

        if (!full?.dinggAccessCode || !full?.dinggApiKey) {
            throw new BadRequestException(`EC "${ec.name}" has no DINGG credentials configured`);
        }

        // Return cached token if still valid (>5 min buffer)
        if (full.dinggToken && full.dinggTokenExpiresAt) {
            const expiresIn = new Date(full.dinggTokenExpiresAt).getTime() - Date.now();
            if (expiresIn > 5 * 60 * 1000) {
                return full.dinggToken;
            }
        }

        // Fetch fresh token
        this.logger.log(`[DINGG] Refreshing token for EC: ${ec.name}`);
        const res = await this.request<{ token: string }>('POST', '/tech-partner/generate-token', {
            headers: {
                access_code: full.dinggAccessCode,
                api_key: full.dinggApiKey,
            },
        });
        if (!res?.token) throw new Error('[DINGG] generate-token returned no token');

        const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 h
        await this.ecRepo.update(ec.id, {
            dinggToken: res.token,
            dinggTokenExpiresAt: expiresAt,
            dinggEnabled: true,
        } as any);

        return res.token;
    }

    // ── 2. Customer Push ─────────────────────────────────────────────────

    async createOrFindCustomer(ec: ExperienceCenter, customer: Customer): Promise<string> {
        if (customer.dinggCustomerUuid) return customer.dinggCustomerUuid;

        const token = await this.getToken(ec);
        const phone = normalizePhone(customer.phone)?.replace(/^\+91/, '') ?? customer.phone;
        const [firstName, ...rest] = (customer.name ?? 'Unknown').split(' ');
        const lastName = rest.join(' ') || undefined;

        const body = new URLSearchParams({
            fname: firstName,
            ...(lastName ? { lname: lastName } : {}),
            mobile: phone,
            ...(customer.email ? { email: customer.email } : {}),
            gender: (customer.gender as string) ?? 'female',
            country_id: '101',
            is_whatsapp_num: 'true',
        });

        const res = await this.request<any>('POST', '/vendor/customer_create', {
            token,
            locationUuid: ec.dinggVendorLocationUuid,
            body: body.toString(),
            contentType: 'application/x-www-form-urlencoded',
        });

        const dinggUuid: string = res?.customer_uuid ?? res?.data?.customer_uuid;
        if (!dinggUuid) {
            this.logger.warn(`[DINGG] customer_create response: ${JSON.stringify(res)}`);
            throw new Error('[DINGG] No customer_uuid in customer_create response');
        }

        await this.customerRepo.update(customer.id, { dinggCustomerUuid: dinggUuid });
        this.logger.log(`[DINGG] Customer ${customer.id} → DINGG uuid: ${dinggUuid}`);
        return dinggUuid;
    }

    // ── 3. Services & Slots ──────────────────────────────────────────────

    async getServices(ecId: string): Promise<DinggServiceItem[]> {
        const ec = await this.findActiveEc(ecId);
        const token = await this.getToken(ec);
        const data = await this.request<any>(
            'GET',
            `/client/business/${ec.dinggVendorLocationUuid}/services`,
            { token },
        );
        return (data?.services ?? data ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            duration: s.duration_time ?? s.duration,
            price: s.price ?? 0,
        }));
    }

    async getAvailableSlots(
        ecId: string,
        startDate: string,
        endDate: string,
        serviceIds?: string,
    ): Promise<DinggSlot[]> {
        const ec = await this.findActiveEc(ecId);
        const token = await this.getToken(ec);

        const params = serviceIds ? `?service_ids=${serviceIds}` : '';
        const path = `/client/business/${ec.dinggVendorLocationUuid}/slots/${startDate}/${endDate}${params}`;
        const data = await this.request<any>('GET', path, { token });

        const slots: DinggSlot[] = [];
        const days: any[] = data?.slots ?? data ?? [];
        for (const day of days) {
            for (const slot of day.available_slots ?? []) {
                slots.push({
                    date: day.date,
                    startTime: slot.start_time,
                    endTime: slot.end_time,
                    label: this.minutesToLabel(slot.start_time),
                    staffUuid: slot.staff_uuid,
                });
            }
        }
        return slots;
    }

    // ── 4. Create Booking ────────────────────────────────────────────────

    async createBooking(ecId: string, dto: DinggBookingDto): Promise<any> {
        const ec = await this.findActiveEc(ecId);
        const token = await this.getToken(ec);

        const customer = await this.customerRepo.findOne({ where: { id: dto.customerId } });
        if (!customer) throw new NotFoundException('Customer not found');

        const dinggCustomerUuid = await this.createOrFindCustomer(ec, customer);

        const bookingPayload = {
            vendor_location_uuid: ec.dinggVendorLocationUuid,
            booking_date: dto.bookingDate,
            booking_comment: '',
            booking_status: 'tentative',
            merge_services_of_same_staff: true,
            total: dto.total,
            services: [{
                service_id: dto.serviceId,
                service_name: dto.serviceName,
                start_time: dto.startTime,
                end_time: dto.endTime,
                ...(dto.staffUuid ? { employee_uuid: dto.staffUuid } : {}),
            }],
        };

        const res = await this.request<any>('POST', '/user/booking', {
            token,
            customerUuid: dinggCustomerUuid,
            locationUuid: ec.dinggVendorLocationUuid,
            json: bookingPayload,
        });

        const bookingUuid: string = res?.booking_uuid ?? res?.data?.booking_uuid ?? String(res?.id ?? '');
        this.logger.log(`[DINGG] Booking created: ${bookingUuid} for customer ${dto.customerId}`);

        // Save to unified orders table
        const orderData: Partial<Order> = {
            orderSource: OrderSource.DINGG,
            customerId: dto.customerId,
            customerPhone: customer.phone,
            leadId: dto.leadId,
            dinggBookingUuid: bookingUuid,
            dinggLocationUuid: ec.dinggVendorLocationUuid,
            dinggBookingDate: dto.bookingDate,
            dinggBookingStatus: 'tentative',
            total: dto.total,
            currency: 'INR',
            source: 'dingg_ec',
            metadata: {
                serviceId: dto.serviceId,
                serviceName: dto.serviceName,
                startTime: dto.startTime,
                endTime: dto.endTime,
                ecName: ec.name,
            },
        } as any;

        const saved = await this.orderRepo.save(this.orderRepo.create(orderData as any));
        return saved;
    }

    // ── 5. Daily Transaction Sync (Cron) ─────────────────────────────────

    @Cron('0 2 * * *', { timeZone: 'Asia/Kolkata' })  // 2 AM IST daily
    async runDailySync(): Promise<void> {
        this.logger.log('[DINGG] Starting daily transaction sync...');
        const today = new Date();
        for (let i = 1; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            await this.syncTransactionsForDate(d.toISOString().split('T')[0]);
        }
        this.logger.log('[DINGG] Daily sync complete');
    }

    async syncTransactionsForDate(date: string): Promise<{ matched: number; unmatched: number }> {
        const ecs = await this.ecRepo.find({ where: { isActive: true, dinggEnabled: true } });
        let matched = 0;
        let unmatched = 0;

        for (const ec of ecs) {
            if (!ec.dinggVendorLocationUuid) continue;
            try {
                const token = await this.getToken(ec);
                const bills = await this.request<any>('GET', '/vendor/bills', {
                    token,
                    locationUuid: ec.dinggVendorLocationUuid,
                    query: { date },
                });

                const invoices: any[] = bills?.data ?? bills ?? [];
                for (const invoice of invoices) {
                    const phone = invoice?.user?.mobile;
                    const customerUuid = invoice?.user?.customer_uuid;

                    let customer: Customer | null = null;

                    if (customerUuid) {
                        customer = await this.customerRepo.findOne({ where: { dinggCustomerUuid: customerUuid } });
                    }
                    if (!customer && phone) {
                        const normalized = normalizePhone(phone);
                        customer = await this.customerRepo.findOne({ where: { phone: normalized } });
                    }

                    if (customer) {
                        const invoiceDate = new Date(invoice.selected_date ?? date);
                        const amount = parseFloat(invoice.total ?? invoice.paid ?? 0);

                        await this.dataSource.transaction(async (em) => {
                            await em.createQueryBuilder()
                                .update(Customer)
                                .set({
                                    dinggCustomerUuid: customerUuid ?? customer.dinggCustomerUuid,
                                    dinggTransactedAt: customer.dinggTransactedAt ?? invoiceDate,
                                    dinggLastTransactionAt: invoiceDate,
                                    dinggTotalSpend: () => `dingg_total_spend + ${amount}`,
                                    dinggVisitCount: () => `dingg_visit_count + 1`,
                                } as any)
                                .where('id = :id', { id: customer.id })
                                .execute();

                            if (invoice.invoice_uuid) {
                                await em.createQueryBuilder()
                                    .update(Order)
                                    .set({
                                        dinggInvoiceUuid: invoice.invoice_uuid,
                                        dinggBookingStatus: 'completed',
                                    } as any)
                                    .where(
                                        'customer_id = :cid AND order_source = :src AND dingg_booking_date = :date',
                                        { cid: customer.id, src: OrderSource.DINGG, date },
                                    )
                                    .andWhere('dingg_invoice_uuid IS NULL')
                                    .execute();
                            }
                        });

                        this.logger.log(`[DINGG] Sync matched: customer=${customer.id} amount=${amount} date=${date}`);
                        matched++;
                    } else {
                        this.logger.warn(`[DINGG] Sync unmatched: phone=${phone} uuid=${customerUuid} date=${date}`);
                        unmatched++;
                    }
                }
            } catch (err: any) {
                this.logger.error(`[DINGG] Sync error for EC "${ec.name}": ${err.message}`);
            }
        }

        return { matched, unmatched };
    }

    // ── 6. Stats ─────────────────────────────────────────────────────────

    async getConversionStats() {
        const [totalEcLeads] = await this.dataSource.query(
            `SELECT COUNT(*) AS total FROM lead_records WHERE status = 'converted:Marked to EC'`,
        );
        const [booked] = await this.dataSource.query(
            `SELECT COUNT(*) AS total FROM orders WHERE order_source = 'dingg'`,
        );
        const [transacted] = await this.dataSource.query(
            `SELECT COUNT(*) AS total, COALESCE(AVG(dingg_total_spend), 0) AS avg_spend
             FROM customers WHERE dingg_transacted_at IS NOT NULL`,
        );
        return {
            ecLeadsConverted:   parseInt(totalEcLeads.total),
            dinggBookingsMade:  parseInt(booked.total),
            customersTransacted: parseInt(transacted.total),
            avgSpend:           parseFloat(transacted.avg_spend ?? 0).toFixed(2),
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private async findActiveEc(ecId: string): Promise<ExperienceCenter> {
        const ec = await this.ecRepo.findOne({ where: { id: ecId, isActive: true } });
        if (!ec) throw new NotFoundException(`Experience Centre ${ecId} not found`);
        if (!ec.dinggVendorLocationUuid) {
            throw new BadRequestException(`EC "${ec.name}" has no DINGG location UUID`);
        }
        return ec;
    }

    private minutesToLabel(minutes: number): string {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
    }

    private async request<T>(
        method: 'GET' | 'POST',
        path: string,
        opts: {
            token?: string;
            headers?: Record<string, string>;
            locationUuid?: string;
            customerUuid?: string;
            json?: any;
            body?: string;
            contentType?: string;
            query?: Record<string, string>;
        } = {},
    ): Promise<T> {
        const qs = opts.query
            ? '?' + new URLSearchParams(opts.query).toString()
            : '';
        const url = `${this.baseUrl}${path}${qs}`;

        const headers: Record<string, string> = {
            ...(opts.headers ?? {}),
            'Content-Type': opts.contentType ?? 'application/json',
        };
        if (opts.token)        headers['Authorization']        = `Bearer ${opts.token}`;
        if (opts.locationUuid) headers['vendor_location_uuid'] = opts.locationUuid;
        if (opts.customerUuid) headers['customer_uuid']        = opts.customerUuid;

        const fetchOpts: RequestInit = { method, headers };
        if (opts.json)      fetchOpts.body = JSON.stringify(opts.json);
        else if (opts.body) fetchOpts.body = opts.body;

        const res  = await fetch(url, fetchOpts);
        const json = await res.json() as any;

        if (!res.ok) {
            const msg = json?.message ?? JSON.stringify(json);
            throw new Error(`[DINGG] ${method} ${path} → ${res.status}: ${msg}`);
        }
        return json as T;
    }
}
