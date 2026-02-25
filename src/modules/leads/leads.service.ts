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
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto } from './dto/create-lead.dto';
import { normalizePhone } from '../../common/utils/phone.util';

export interface LeadsQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    assignedToId?: string;
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
    { dtoKey: 'preferredProducts', label: 'Preferred Products', getter: l => l.preferredProducts },
];

function stringify(val: any): string {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
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
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly dataSource: DataSource,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────
    async create(dto: CreateLeadDto): Promise<LeadRecord> {
        return this.dataSource.transaction(async (em) => {
            const nameParts = dto.name.trim().split(' ');
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
                    name: dto.name.trim(),
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
                campaignId: dto.campaignId,
                specificDetails: dto.specificDetails,
                preferredProducts: dto.preferredProducts,
                preferredExperienceCenter: dto.preferredExperienceCenter,
                preferredProductOptions: dto.preferredProductOptions,
                appointmentBooked: dto.appointmentBooked,
                bookedDate: dto.bookedDate,
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
            this.logger.log(`Lead created: record=${saved.id} customer=${customer.id}`);

            return em.findOne(LeadRecord, {
                where: { id: saved.id },
                relations: ['customer', 'assignedTo'],
            }) as Promise<LeadRecord>;
        });
    }

    // ── Find All ──────────────────────────────────────────────────────────
    async findAll(
        query: LeadsQuery = {},
        requestingUser?: User,
    ): Promise<{ leads: LeadRecord[]; total: number }> {
        const { page = 1, limit = 20, search, status, assignedToId } = query;

        const qb = this.leadRecordRepo
            .createQueryBuilder('lr')
            .leftJoinAndSelect('lr.customer', 'customer')
            .leftJoinAndSelect('lr.assignedTo', 'assignedTo')
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

        if (search) {
            qb.andWhere(
                '(customer.name ILIKE :s OR customer.phone ILIKE :s OR customer.city ILIKE :s)',
                { s: `%${search}%` },
            );
        }

        const [leads, total] = await qb.getManyAndCount();
        return { leads, total };
    }

    // ── Update (with history tracking) ────────────────────────────────────
    async update(id: string, dto: UpdateLeadRecordDto, requestingUser?: User): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({
            where: { id },
            relations: ['customer'],
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
            const nextHour = new Date();
            nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0); // top of next hour
            lead.nextActionDate = nextHour.toISOString();
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
        if (dto.status !== undefined) lead.status = dto.status as LeadStatus;
        if (dto.preferredExperienceCenter !== undefined) lead.preferredExperienceCenter = dto.preferredExperienceCenter;
        if (dto.nextActionDate) lead.nextActionDate = dto.nextActionDate; // only override if explicitly set (non-empty)
        if (dto.preferredProducts !== undefined) lead.preferredProducts = dto.preferredProducts;
        if (dto.preferredProductOptions !== undefined) lead.preferredProductOptions = dto.preferredProductOptions;

        const saved = await this.leadRecordRepo.save(lead);

        // Save all history diffs (non-blocking)
        if (historyEntries.length > 0) {
            await this.leadHistoryRepo.save(historyEntries.map(e => this.leadHistoryRepo.create(e)));
        }

        return this.leadRecordRepo.findOne({
            where: { id: saved.id },
            relations: ['customer', 'assignedTo'],
        }) as Promise<LeadRecord>;
    }

    // ── Get History (customer-wide: all leads for the same customer) ──────
    async getHistory(leadId: string): Promise<{
        currentLead: { id: string; createdAt: Date; history: LeadHistory[] };
        priorLeads: { id: string; createdAt: Date; history: LeadHistory[] }[];
    }> {
        // 1. Find the requested lead to get its customerId
        const lead = await this.leadRecordRepo.findOne({ where: { id: leadId } });
        if (!lead) throw new NotFoundException('Lead not found');

        // 2. Find all lead record IDs for this customer, ordered oldest first
        const allLeads = await this.leadRecordRepo.find({
            where: { customerId: lead.customerId },
            order: { createdAt: 'ASC' },
            select: ['id', 'createdAt'],
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
            history: historyByLead.get(lead.id) ?? [],
        };

        const priorLeads = allLeads
            .filter(l => l.id !== lead.id)
            .map(l => ({
                id: l.id,
                createdAt: l.createdAt,
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
            relations: ['customer', 'assignedTo'],
        }) as Promise<LeadRecord>;
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
            relations: ['customer', 'assignedTo'],
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
