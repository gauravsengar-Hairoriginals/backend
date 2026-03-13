import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { LeadRecord, LeadStatus } from './entities/lead-record.entity';
import { LeadHistory } from './entities/lead-history.entity';
import { LeadProduct } from './entities/lead-product.entity';
import { LeadProductOption } from './entities/lead-product-option.entity';
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto, CreateLeadProductDto } from './dto/create-lead.dto';
import { normalizePhone } from '../../common/utils/phone.util';
import { LeadCategorisationService } from '../../common/services/lead-categorisation.service';

export interface LeadsQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    assignedToId?: string;
    fromDate?: string;   // ISO date string e.g. '2026-03-01'
    toDate?: string;     // ISO date string e.g. '2026-03-31'
    // Per-column filters
    name?: string;
    phone?: string;
    city?: string;
    source?: string;
    campaign?: string;
    assignedTo?: string;
    leadCategory?: string;  // EC | HT | WEBSITE | POPIN
    // Tab filter
    tab?: 'all' | 'fresh' | 'reminder' | 'revisit' | 'converted' | 'dropped';
}

/** Fields on LeadRecord (and Customer) we want to track in history */
const TRACKED_LEAD_FIELDS: Array<{ dtoKey: keyof UpdateLeadRecordDto; label: string; getter: (l: LeadRecord) => any }> = [
    { dtoKey: 'source', label: 'Source', getter: l => l.source },
    { dtoKey: 'pageType', label: 'Page Type', getter: l => l.pageType },
    { dtoKey: 'campaignId', label: 'Campaign ID', getter: l => l.campaignId },
    { dtoKey: 'call1', label: 'Call 1', getter: l => l.call1 },
    { dtoKey: 'call2', label: 'Call 2', getter: l => l.call2 },
    { dtoKey: 'call3', label: 'Call 3', getter: l => l.call3 },
    { dtoKey: 'remarks', label: 'Remarks', getter: l => l.remarks },
    { dtoKey: 'appointmentBooked', label: 'Appointment Booked', getter: l => l.appointmentBooked },
    { dtoKey: 'bookedDate', label: 'Booked Date', getter: l => l.bookedDate },
    { dtoKey: 'status', label: 'Status', getter: l => l.status },
    { dtoKey: 'preferredExperienceCenter', label: 'Experience Center', getter: l => l.preferredExperienceCenter },
    { dtoKey: 'nextActionDate', label: 'Next Action Date', getter: l => l.nextActionDate },
];

function stringify(val: any): string {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

/** Build a human-readable summary of lead products for history tracking */
function summariseProducts(leadProducts: LeadProduct[]): string {
    if (!leadProducts || leadProducts.length === 0) return '';
    return leadProducts.map(lp => {
        const opts = (lp.options ?? []).map(o => `${o.optionName}:${o.optionValue}`).join(', ');
        return opts ? `${lp.productTitle} (${opts})` : lp.productTitle;
    }).join('; ');
}

/** Create LeadProduct + LeadProductOption entities from DTO array (does not persist) */
function buildLeadProducts(dtoProducts: CreateLeadProductDto[], leadRecordId: string): LeadProduct[] {
    return dtoProducts.map(p => {
        const lp = new LeadProduct();
        lp.leadRecordId = leadRecordId;
        lp.productId = p.productId ?? null as any;
        lp.productTitle = p.productTitle;
        lp.quantity = p.quantity ?? 1;
        lp.options = (p.options ?? []).map(o => {
            const opt = new LeadProductOption();
            opt.optionName = o.name;
            opt.optionValue = o.value;
            return opt;
        });
        return lp;
    });
}


@Injectable()
export class LeadsService {
    private readonly logger = new Logger(LeadsService.name);

    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(LeadRecord)
        private readonly leadRecordRepo: Repository<LeadRecord>,
        @InjectRepository(LeadHistory)
        private readonly leadHistoryRepo: Repository<LeadHistory>,
        @InjectRepository(LeadProduct)
        private readonly leadProductRepo: Repository<LeadProduct>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly dataSource: DataSource,
        private readonly categorisation: LeadCategorisationService,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────
    async create(dto: CreateLeadDto): Promise<LeadRecord> {
        return this.dataSource.transaction(async (em) => {
            const nameParts = (dto.name ?? '').trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            // Reuse existing customer by phone, or create new
            let customer = await em.findOne(Customer, {
                where: { phone: normalizePhone(dto.phone) },
            });

            if (!customer) {
                customer = em.create(Customer, {
                    firstName,
                    lastName,
                    name: (dto.name ?? '').trim(),
                    phone: normalizePhone(dto.phone),
                    city: dto.city,
                    addressLine1: dto.address,
                    pincode: dto.pincode,
                    notes: dto.notes,
                    tags: ['lead'],
                    lastActivityPlatform: 'api',
                });
                customer = await em.save(Customer, customer);
            } else {
                if (!customer.tags?.includes('lead')) {
                    customer.tags = [...(customer.tags || []), 'lead'];
                    await em.save(Customer, customer);
                }
            }

            const leadRecord = em.create(LeadRecord, {
                customerId: customer.id,
                source: dto.source,
                pageType: dto.pageType,
                leadCategory: this.categorisation.deriveLeadCategory(dto.source, dto.pageType, (dto as any).leadCategory),
                campaignId: dto.campaignId,
                specificDetails: dto.specificDetails,
                preferredExperienceCenter: dto.preferredExperienceCenter,
                customerProductInterest: dto.customerProductInterest,
                consultationType: (dto as any).consultationType,
                appointmentBooked: dto.appointmentBooked,
                bookedDate: dto.bookedDate,
                bookedTimeSlot: (dto as any).bookedTimeSlot,
                nextActionDate: dto.nextActionDate,
                status: LeadStatus.NEW,
                isRevisit: false, // Will update below if prior leads exist
            });

            // Check if this customer already had a prior lead record
            const priorLeadCount = await em.count(LeadRecord, {
                where: { customerId: customer.id },
            });
            if (priorLeadCount > 0) {
                leadRecord.isRevisit = true;
            }

            const saved = await em.save(LeadRecord, leadRecord);

            // Save products (Two-Layer)
            if (dto.products && dto.products.length > 0) {
                const leadProducts = buildLeadProducts(dto.products, saved.id);
                await em.save(LeadProduct, leadProducts);
            }

            this.logger.log(`Lead created: record=${saved.id} customer=${customer.id}`);

            const final = await em.findOne(LeadRecord, {
                where: { id: saved.id },
                relations: ['customer', 'assignedTo', 'leadProducts', 'leadProducts.options'],
            }) as LeadRecord;

            // Auto-assign after creation (outside the em to avoid deadlock)
            setImmediate(() => this.autoAssignLead(final).catch(e => this.logger.warn('autoAssign error: ' + e?.message)));

            return final;
        });
    }

    /**
     * Checks if a Facebook lead already exists by checking the specificDetails
     * JSON payload for a matching fb_leadgen_id. Used for deduplication.
     */
    async findByFacebookLeadgenId(leadgenId: string): Promise<LeadRecord | null> {
        return this.leadRecordRepo
            .createQueryBuilder('lead')
            .where(`lead.specific_details->>'fb_leadgen_id' = :leadgenId`, { leadgenId })
            .getOne();
    }

    // ── Auto-Assignment Engine ─────────────────────────────────────────────
    private async autoAssignLead(lead: LeadRecord): Promise<void> {
        // Refresh to get fresh customer relation
        const freshLead = await this.leadRecordRepo.findOne({
            where: { id: lead.id },
            relations: ['customer'],
        });
        if (!freshLead) return;

        const category = freshLead.leadCategory;
        if (!category) return;

        const callerCategory = this.categorisation.callerCategoryFor(category);
        if (!callerCategory) return;

        let assignedUserId: string | null = null;

        if (category === 'POPIN') {
            // Assign to the caller who handled the popin/IVR call (matched by agentPhone)
            const agentPhone = freshLead.specificDetails?.agentPhone
                ?? freshLead.specificDetails?.agent_phone;
            if (agentPhone) {
                const caller = await this.userRepo.findOne({
                    where: {
                        phone: normalizePhone(agentPhone),
                        role: UserRole.LEAD_CALLER,
                        isOnShift: true,
                    },
                });
                assignedUserId = caller?.id ?? null;
            }
        } else {
            // Round-robin by caller category + region
            const region = this.categorisation.cityToRegion(freshLead.customer?.city);
            const callers = await this.userRepo
                .createQueryBuilder('u')
                .where('u.role = :role', { role: UserRole.LEAD_CALLER })
                .andWhere('u.caller_category = :cat', { cat: callerCategory })
                .andWhere('u.caller_region = :region', { region })
                .andWhere('u.is_on_shift = true')
                .andWhere('u.is_active = true')
                .orderBy('u.last_assigned_at', 'ASC', 'NULLS FIRST')
                .getMany();

            if (callers.length > 0) {
                assignedUserId = callers[0].id;
            }
        }

        if (assignedUserId) {
            const assignee = await this.userRepo.findOne({ where: { id: assignedUserId } });
            await this.leadRecordRepo.update(lead.id, {
                assignedToId: assignedUserId,
                assignedToName: assignee?.name ?? '',
            });
            await this.userRepo.update(assignedUserId, { lastAssignedAt: new Date() });
            this.logger.log(`Lead ${lead.id} auto-assigned to ${assignedUserId} [${category}]`);
        } else {
            this.logger.warn(`Lead ${lead.id}: no available caller for category=${category}`);
        }
    }

    // ── Find All ──────────────────────────────────────────────────────────
    async findAll(
        query: LeadsQuery = {},
        requestingUser?: User,
    ): Promise<{ leads: LeadRecord[]; total: number }> {
        const {
            page = 1, limit = 20, search, status, assignedToId, fromDate, toDate,
            name, phone, city, source, campaign, assignedTo, tab
        } = query;

        const qb = this.leadRecordRepo
            .createQueryBuilder('lr')
            .leftJoinAndSelect('lr.customer', 'customer')
            .leftJoinAndSelect('lr.assignedTo', 'assignedTo')
            .leftJoinAndSelect('lr.leadProducts', 'leadProducts')
            .leftJoinAndSelect('leadProducts.options', 'productOptions')
            .orderBy('lr.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        // LEAD_CALLER only sees their own assigned leads
        if (requestingUser?.role === UserRole.LEAD_CALLER) {
            qb.where('lr.assigned_to_id = :uid', { uid: requestingUser.id });
        } else {
            if (assignedToId) {
                qb.andWhere('lr.assigned_to_id = :assignedToId', { assignedToId });
            }
            if (status) {
                qb.andWhere('lr.status = :status', { status });
            }
        }

        // Date range filter
        if (fromDate) {
            qb.andWhere('lr.createdAt >= :fromDate', { fromDate: `${fromDate}T00:00:00` });
        }
        if (toDate) {
            qb.andWhere('lr.createdAt <= :toDate', { toDate: `${toDate}T23:59:59` });
        }

        if (search) {
            qb.andWhere(
                '(customer.name ILIKE :s OR customer.phone ILIKE :s OR customer.city ILIKE :s)',
                { s: `%${search}%` },
            );
        }

        // Per-column specific filters
        if (name) {
            qb.andWhere('customer.name ILIKE :nameFilter', { nameFilter: `%${name}%` });
        }
        if (phone) {
            qb.andWhere('customer.phone ILIKE :phoneFilter', { phoneFilter: `%${phone}%` });
        }
        if (city) {
            qb.andWhere('customer.city ILIKE :cityFilter', { cityFilter: `%${city}%` });
        }
        if (source) {
            qb.andWhere('lr.source ILIKE :sourceFilter', { sourceFilter: `%${source}%` });
        }
        if (campaign) {
            qb.andWhere('lr.campaign_id ILIKE :campaignFilter', { campaignFilter: `%${campaign}%` });
        }
        if (assignedTo) {
            qb.andWhere('lr.assigned_to_name ILIKE :assignedToFilter', { assignedToFilter: `%${assignedTo}%` });
        }
        if (query?.leadCategory) {
            qb.andWhere('lr.lead_category = :leadCategory', { leadCategory: query.leadCategory });
        }

        // Tab logic
        if (tab) {
            const closedStatuses = ['dropped', 'converted:Marked to EC', 'converted:Marked to HT', 'converted:Marked to VC'];
            if (tab === 'fresh') {
                qb.andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses });
                qb.andWhere('lr.call1 IS NULL');
            } else if (tab === 'reminder') {
                qb.andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses });
                qb.andWhere('lr.next_action_date IS NOT NULL');
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                qb.andWhere('lr.next_action_date <= :today', { today });
                qb.andWhere('lr.updated_at < lr.next_action_date');
            } else if (tab === 'revisit') {
                qb.andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses });
                qb.andWhere('lr.is_revisit = true');
            } else if (tab === 'converted') {
                qb.andWhere('lr.status LIKE :conv', { conv: 'converted:%' });
            } else if (tab === 'dropped') {
                qb.andWhere('lr.status = :dropped', { dropped: 'dropped' });
            } else if (tab === 'all') {
                qb.andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses });
            }
        }

        const [leads, total] = await qb.getManyAndCount();
        return { leads, total };
    }

    // ── Get Tab Counts ────────────────────────────────────────────────────
    async getTabCounts(requestingUser?: User, query?: LeadsQuery): Promise<Record<string, number>> {
        const closedStatuses = ['dropped', 'converted:Marked to EC', 'converted:Marked to HT', 'converted:Marked to VC'];
        const qbBase = () => {
            const q = this.leadRecordRepo.createQueryBuilder('lr');
            if (requestingUser?.role === UserRole.LEAD_CALLER) {
                q.where('lr.assigned_to_id = :uid', { uid: requestingUser.id });
            } else if (query?.assignedToId) {
                q.where('lr.assigned_to_id = :assignedToId', { assignedToId: query.assignedToId });
            }
            if (query?.fromDate) q.andWhere('lr.created_at >= :fromDate', { fromDate: `${query.fromDate}T00:00:00` });
            if (query?.toDate) q.andWhere('lr.created_at <= :toDate', { toDate: `${query.toDate}T23:59:59` });
            return q;
        };

        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const [all, fresh, reminder, revisit, converted, dropped] = await Promise.all([
            qbBase().andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses }).getCount(),
            qbBase().andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses }).andWhere('lr.call1 IS NULL').getCount(),
            qbBase().andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses })
                .andWhere('lr.next_action_date IS NOT NULL')
                .andWhere('lr.next_action_date <= :today', { today })
                .andWhere('lr.updated_at < lr.next_action_date').getCount(),
            qbBase().andWhere('lr.status NOT IN (:...closedStatuses)', { closedStatuses }).andWhere('lr.is_revisit = true').getCount(),
            qbBase().andWhere('lr.status LIKE :conv', { conv: 'converted:%' }).getCount(),
            qbBase().andWhere('lr.status = :dropped', { dropped: 'dropped' }).getCount(),
        ]);

        return { all, fresh, reminder, revisit, converted, dropped };
    }

    // ── Update (with history tracking) ────────────────────────────────────
    async update(id: string, dto: UpdateLeadRecordDto, requestingUser?: User): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({
            where: { id },
            relations: ['customer', 'leadProducts', 'leadProducts.options'],
        });
        if (!lead) throw new NotFoundException('Lead not found');

        if (
            requestingUser?.role === UserRole.LEAD_CALLER &&
            lead.assignedToId !== requestingUser.id
        ) {
            throw new BadRequestException('You can only update your own assigned leads');
        }

        // ── Capture diffs for history ──────────────────────────────────────
        const historyEntries: Partial<LeadHistory>[] = [];

        // Customer-level fields
        const customerFieldMap: Array<{ dtoKey: string; label: string; getter: () => any }> = [
            { dtoKey: 'name', label: 'Name', getter: () => lead.customer?.name },
            { dtoKey: 'phone', label: 'Phone', getter: () => lead.customer?.phone },
            { dtoKey: 'city', label: 'City', getter: () => lead.customer?.city },
            { dtoKey: 'address', label: 'Address', getter: () => lead.customer?.addressLine1 },
            { dtoKey: 'pincode', label: 'Pincode', getter: () => lead.customer?.pincode },
            { dtoKey: 'notes', label: 'Notes', getter: () => lead.customer?.notes },
        ];

        for (const f of customerFieldMap) {
            if ((dto as any)[f.dtoKey] !== undefined) {
                const oldVal = stringify(f.getter());
                const newVal = stringify((dto as any)[f.dtoKey]);
                if (oldVal !== newVal) {
                    historyEntries.push({ leadRecordId: id, fieldName: f.label, oldValue: oldVal, newValue: newVal });
                }
            }
        }

        // Lead-record fields
        for (const f of TRACKED_LEAD_FIELDS) {
            if (dto[f.dtoKey] !== undefined) {
                const oldVal = stringify(f.getter(lead));
                const newVal = stringify(dto[f.dtoKey]);
                if (oldVal !== newVal) {
                    historyEntries.push({ leadRecordId: id, fieldName: f.label, oldValue: oldVal, newValue: newVal });
                }
            }
        }

        // Track product changes
        if (dto.products !== undefined) {
            const oldSummary = summariseProducts(lead.leadProducts ?? []);
            const newProducts = buildLeadProducts(dto.products, id);
            const newSummary = summariseProducts(newProducts);
            if (oldSummary !== newSummary) {
                historyEntries.push({ leadRecordId: id, fieldName: 'Products', oldValue: oldSummary, newValue: newSummary });
            }
        }

        // Apply who changed it
        if (requestingUser) {
            historyEntries.forEach(e => {
                e.changedById = requestingUser.id;
                e.changedByName = requestingUser.name || requestingUser.email || 'Unknown';
                e.changedByEmail = requestingUser.email;
            });
        }

        // Update customer-level fields
        if (dto.name || dto.phone || dto.city || dto.address || dto.pincode || dto.notes) {
            const customer = lead.customer;
            if (dto.name) {
                const parts = dto.name.trim().split(' ');
                customer.firstName = parts[0];
                customer.lastName = parts.slice(1).join(' ') || '';
                customer.name = dto.name.trim();
            }
            if (dto.phone) customer.phone = normalizePhone(dto.phone);
            if (dto.city !== undefined) customer.city = dto.city;
            if (dto.address !== undefined) customer.addressLine1 = dto.address;
            if (dto.pincode !== undefined) customer.pincode = dto.pincode;
            if (dto.notes !== undefined) customer.notes = dto.notes;
            await this.customerRepo.save(customer);
        }

        // Update lead-record fields
        if (dto.source !== undefined) lead.source = dto.source;
        if (dto.pageType !== undefined) lead.pageType = dto.pageType;
        if (dto.campaignId !== undefined) lead.campaignId = dto.campaignId;
        if (dto.specificDetails !== undefined) lead.specificDetails = dto.specificDetails;
        const RNR_VALUE = 'RNR/Disconnect/Busy';
        const scheduleOneHourLater = () => {
            const sixtyMinsLater = new Date(Date.now() + 60 * 60 * 1000);
            lead.nextActionDate = sixtyMinsLater.toISOString();
        };

        if (dto.call1 !== undefined) {
            lead.call1 = dto.call1;
            // Auto-advance status from 'new' → 'contacted' on first call
            if (lead.status === LeadStatus.NEW) {
                lead.status = LeadStatus.CONTACTED;
            }
            if (dto.call1 === RNR_VALUE) scheduleOneHourLater();
        }
        if (dto.call2 !== undefined) {
            lead.call2 = dto.call2;
            if (dto.call2 === RNR_VALUE) scheduleOneHourLater();
        }
        if (dto.call3 !== undefined) {
            lead.call3 = dto.call3;
            if (dto.call3 === RNR_VALUE) scheduleOneHourLater();
        }
        if (dto.remarks !== undefined) lead.remarks = dto.remarks;
        if (dto.appointmentBooked !== undefined) lead.appointmentBooked = dto.appointmentBooked;
        if (dto.bookedDate !== undefined) lead.bookedDate = dto.bookedDate;
        if ((dto as any).bookedTimeSlot !== undefined) lead.bookedTimeSlot = (dto as any).bookedTimeSlot;
        if (dto.status !== undefined) lead.status = dto.status as LeadStatus;
        if (dto.preferredExperienceCenter !== undefined) lead.preferredExperienceCenter = dto.preferredExperienceCenter;
        if (dto.customerProductInterest !== undefined) lead.customerProductInterest = dto.customerProductInterest;
        if ((dto as any).consultationType !== undefined) lead.consultationType = (dto as any).consultationType;
        if (dto.nextActionDate) lead.nextActionDate = dto.nextActionDate; // only override if explicitly set (non-empty)

        const saved = await this.leadRecordRepo.save(lead);

        // Upsert products: delete-and-recreate approach
        if (dto.products !== undefined) {
            // Delete existing products for this lead
            await this.leadProductRepo.delete({ leadRecordId: id });
            // Insert new products
            if (dto.products.length > 0) {
                const newProducts = buildLeadProducts(dto.products, id);
                await this.leadProductRepo.save(newProducts);
            }
        }

        // Save all history diffs (non-blocking)
        if (historyEntries.length > 0) {
            await this.leadHistoryRepo.save(historyEntries.map(e => this.leadHistoryRepo.create(e)));
        }

        return this.leadRecordRepo.findOne({
            where: { id: saved.id },
            relations: ['customer', 'assignedTo', 'leadProducts', 'leadProducts.options'],
        }) as Promise<LeadRecord>;
    }

    // ── Get History (customer-wide: all leads for the same customer) ──────
    async getHistory(leadId: string): Promise<{
        currentLead: { id: string; createdAt: Date; status: string; history: LeadHistory[] };
        priorLeads: { id: string; createdAt: Date; status: string; history: LeadHistory[] }[];
    }> {
        // 1. Find the requested lead to get its customerId
        const lead = await this.leadRecordRepo.findOne({ where: { id: leadId } });
        if (!lead) throw new NotFoundException('Lead not found');

        // 2. Find all lead record IDs for this customer, ordered oldest first
        const allLeads = await this.leadRecordRepo.find({
            where: { customerId: lead.customerId },
            order: { createdAt: 'ASC' },
            select: ['id', 'createdAt', 'status'],
        });

        // 3. Fetch ALL history entries for all those leads in one query
        const allLeadIds = allLeads.map(l => l.id);
        const allHistory = await this.leadHistoryRepo
            .createQueryBuilder('h')
            .leftJoinAndSelect('h.changedBy', 'changedBy')
            .where('h.lead_record_id IN (:...ids)', { ids: allLeadIds })
            .orderBy('h.changed_at', 'DESC')
            .getMany();

        // 4. Group history by leadId
        const historyByLead = new Map<string, LeadHistory[]>();
        for (const h of allHistory) {
            if (!historyByLead.has(h.leadRecordId)) historyByLead.set(h.leadRecordId, []);
            historyByLead.get(h.leadRecordId)!.push(h);
        }

        // 5. Separate current lead vs prior leads
        const currentLead = {
            id: lead.id,
            createdAt: lead.createdAt,
            status: lead.status,
            history: historyByLead.get(lead.id) ?? [],
        };

        const priorLeads = allLeads
            .filter(l => l.id !== lead.id)
            .map(l => ({
                id: l.id,
                createdAt: l.createdAt,
                status: l.status,
                history: historyByLead.get(l.id) ?? [],
            }))
            .reverse(); // newest prior lead first

        return { currentLead, priorLeads };
    }

    // ── Assign ────────────────────────────────────────────────────────────
    async assignLead(id: string, dto: AssignLeadDto): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({ where: { id } });
        if (!lead) throw new NotFoundException('Lead not found');

        const caller = await this.userRepo.findOne({
            where: { id: dto.callerId, role: UserRole.LEAD_CALLER },
        });
        if (!caller) throw new NotFoundException('Lead caller not found');

        const oldAssignee = lead.assignedToName || '';
        lead.assignedToId = caller.id;
        lead.assignedToName = caller.name;
        const savedAssign = await this.leadRecordRepo.save(lead);

        // Record assignment in history
        await this.leadHistoryRepo.save(this.leadHistoryRepo.create({
            leadRecordId: id,
            fieldName: 'Assigned To',
            oldValue: oldAssignee,
            newValue: caller.name,
        }));

        return this.leadRecordRepo.findOne({
            where: { id: savedAssign.id },
            relations: ['customer', 'assignedTo', 'leadProducts', 'leadProducts.options'],
        }) as Promise<LeadRecord>;
    }

    // ── Bulk Assign ───────────────────────────────────────────────────────
    async bulkAssign(leadIds: string[], callerId: string): Promise<{ updated: number }> {
        const caller = await this.userRepo.findOne({
            where: { id: callerId, role: UserRole.LEAD_CALLER },
        });
        if (!caller) throw new NotFoundException('Lead caller not found');

        const leads = await this.leadRecordRepo
            .createQueryBuilder('lr')
            .where('lr.id IN (:...ids)', { ids: leadIds })
            .getMany();

        if (leads.length === 0) throw new NotFoundException('No matching leads found');

        const historyEntries: Partial<LeadHistory>[] = [];

        for (const lead of leads) {
            const oldAssignee = lead.assignedToName || '';
            lead.assignedToId = caller.id;
            lead.assignedToName = caller.name;
            historyEntries.push({
                leadRecordId: lead.id,
                fieldName: 'Assigned To',
                oldValue: oldAssignee,
                newValue: caller.name,
            });
        }

        await this.leadRecordRepo.save(leads);
        if (historyEntries.length > 0) {
            await this.leadHistoryRepo.save(historyEntries.map(e => this.leadHistoryRepo.create(e)));
        }

        this.logger.log(`Bulk assigned ${leads.length} leads to ${caller.name} (${caller.id})`);
        return { updated: leads.length };
    }

    // ── Convert ───────────────────────────────────────────────────────────
    async convertLead(id: string): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({ where: { id }, relations: ['customer'] });
        if (!lead) throw new NotFoundException('Lead not found');
        if ([LeadStatus.CONVERTED_EC, LeadStatus.CONVERTED_HT, LeadStatus.CONVERTED_VC].includes(lead.status as any)) {
            throw new BadRequestException('Lead is already converted');
        }

        lead.status = LeadStatus.CONVERTED_EC; // default; can be changed via edit form
        lead.convertedAt = new Date();

        const customer = lead.customer;
        if (!customer.tags?.includes('customer')) {
            customer.tags = [...(customer.tags || []), 'customer'];
            await this.customerRepo.save(customer);
        }

        const savedConvert = await this.leadRecordRepo.save(lead);

        // Record conversion in history
        await this.leadHistoryRepo.save(this.leadHistoryRepo.create({
            leadRecordId: id,
            fieldName: 'Status',
            oldValue: 'new',
            newValue: 'converted',
        }));

        this.logger.log(`Lead ${id} converted to customer ${customer.id}`);
        return this.leadRecordRepo.findOne({
            where: { id: savedConvert.id },
            relations: ['customer', 'assignedTo', 'leadProducts', 'leadProducts.options'],
        }) as Promise<LeadRecord>;
    }

    // ── Delete Single ─────────────────────────────────────────────────────
    async deleteOne(id: string): Promise<{ deleted: boolean }> {
        const lead = await this.leadRecordRepo.findOne({ where: { id } });
        if (!lead) throw new NotFoundException('Lead not found');
        await this.leadRecordRepo.remove(lead);
        return { deleted: true };
    }

    // ── Delete All ────────────────────────────────────────────────────────
    async deleteAll(): Promise<{ deleted: number }> {
        const result = await this.leadRecordRepo
            .createQueryBuilder()
            .delete()
            .from(LeadRecord)
            .execute();
        this.logger.log(`Bulk deleted ${result.affected} lead records`);
        return { deleted: result.affected ?? 0 };
    }
}
