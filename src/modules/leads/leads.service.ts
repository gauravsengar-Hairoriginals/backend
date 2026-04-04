import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, In } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CallerCategory } from '../users/enums/caller-category.enum';
import { LeadRecord, LeadStatus } from './entities/lead-record.entity';
import { LeadHistory } from './entities/lead-history.entity';
import { LeadProduct } from './entities/lead-product.entity';
import { LeadProductOption } from './entities/lead-product-option.entity';
import { CallLog } from '../call-logs/entities/call-log.entity';
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto, CreateLeadProductDto } from './dto/create-lead.dto';
import { normalizePhone } from '../../common/utils/phone.util';
import { LeadCategorisationService } from '../../common/services/lead-categorisation.service';
import { ChannelierService } from '../channelier/channelier.service';

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
    // Deduplication: show only the latest lead per customer phone
    deduplicateByPhone?: boolean;
    // Priority filter
    isHighPriority?: boolean;
    isUnassigned?: boolean;
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
    { dtoKey: 'isHighPriority', label: 'High Priority', getter: l => l.isHighPriority },
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
        @InjectRepository(CallLog)
        private readonly callLogRepo: Repository<CallLog>,
        private readonly dataSource: DataSource,
        private readonly categorisation: LeadCategorisationService,
        private readonly channelierService: ChannelierService,
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
                // Update customer details if new values are provided
                let customerChanged = false;
                if (dto.name?.trim() && dto.name.trim() !== customer.name) {
                    const nameParts2 = dto.name.trim().split(' ');
                    customer.name      = dto.name.trim();
                    customer.firstName = nameParts2[0];
                    customer.lastName  = nameParts2.slice(1).join(' ') || '';
                    customerChanged = true;
                }
                if (dto.city && dto.city !== customer.city) {
                    customer.city = dto.city;
                    customerChanged = true;
                }
                if (dto.pincode && dto.pincode !== customer.pincode) {
                    customer.pincode = dto.pincode;
                    customerChanged = true;
                }
                if (!customer.tags?.includes('lead')) {
                    customer.tags = [...(customer.tags || []), 'lead'];
                    customerChanged = true;
                }
                if (customerChanged) await em.save(Customer, customer);
            }


            // Merge UTM fields into specificDetails so they're always persisted in JSONB
            const utmFields: Record<string, string> = {};
            if (dto.utm_source)   utmFields.utm_source   = dto.utm_source;
            if (dto.utm_medium)   utmFields.utm_medium   = dto.utm_medium;
            if (dto.utm_campaign) utmFields.utm_campaign = dto.utm_campaign;
            if (dto.utm_term)     utmFields.utm_term     = dto.utm_term;
            if (dto.utm_content)  utmFields.utm_content  = dto.utm_content;

            const leadRecord = em.create(LeadRecord, {
                customerId: customer.id,
                source: dto.source,
                pageType: dto.pageType,
                leadCategory: this.categorisation.deriveLeadCategory(dto.source, dto.pageType, dto.leadCategory),
                campaignId: dto.campaignId,
                specificDetails: { ...(dto.specificDetails ?? {}), ...utmFields },
                preferredExperienceCenter: dto.preferredExperienceCenter,
                customerProductInterest: (dto as any).customerProductInterest,
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

    /** Generic lookup by a top-level key inside the specific_details JSONB column. */
    async findBySpecificDetail(key: string, value: string): Promise<LeadRecord | null> {
        return this.leadRecordRepo
            .createQueryBuilder('lead')
            .where(`lead.specific_details->>:key = :value`, { key, value })
            .getOne();
    }

    // ── Assignment Engine (central, public) ───────────────────────────────
    /**
     * Assign a lead to the best available caller — single source of truth.
     *
     * Priority order:
     *  1. Direct phone match if `agentNumber` supplied (IVR / qkonnect path).
     *  2. POPIN: match via specificDetails.agentPhone.
     *  3. Round-robin by callerCategory + region; shift-first with active-fallback.
     *  4. If lead has no category → set WEBSITE so round-robin can still run.
     */
    async assignLeadById(leadId: string, agentNumber?: string): Promise<void> {
        const lead = await this.leadRecordRepo.findOne({
            where: { id: leadId },
            relations: ['customer'],
        });
        if (!lead) {
            this.logger.warn(`[ASSIGN] Lead ${leadId} not found — skipping`);
            return;
        }

        this.logger.log(`[ASSIGN] Lead ${leadId}: category="${lead.leadCategory}", city="${lead.customer?.city}", agentNumber="${agentNumber ?? '-'}"`);

        let assignedUserId: string | null = null;

        // ── 0. Sticky caller — re-use the caller from any prior lead for this customer ──
        //   "Same customer always goes to the same caller."
        //   Only use a prior assignee if that user is still active.
        if (lead.customerId) {
            const priorLead = await this.leadRecordRepo.findOne({
                where: {
                    customerId: lead.customerId,
                    assignedToId: Not(IsNull()),
                },
                order: { createdAt: 'DESC' },
            });
            if (priorLead?.assignedToId && priorLead.id !== leadId) {
                const priorCaller = await this.userRepo.findOne({
                    where: { id: priorLead.assignedToId, isActive: true },
                });
                if (priorCaller) {
                    assignedUserId = priorCaller.id;
                    this.logger.log(`[ASSIGN] ♻️ Sticky caller: re-using "${priorCaller.name}" from prior lead ${priorLead.id}`);
                    
                    if (priorCaller.callerCategory === CallerCategory.HT_CALLER && lead.leadCategory !== 'HT') {
                        lead.leadCategory = 'HT';
                        await this.leadRecordRepo.update(leadId, { leadCategory: 'HT' });
                        this.logger.log(`[ASSIGN] 🔄 Updated lead category to HT due to sticky caller`);
                    } else if (priorCaller.callerCategory === CallerCategory.EC_CALLER && lead.leadCategory !== 'EC') {
                        lead.leadCategory = 'EC';
                        await this.leadRecordRepo.update(leadId, { leadCategory: 'EC' });
                        this.logger.log(`[ASSIGN] 🔄 Updated lead category to EC due to sticky caller`);
                    }
                } else {
                    this.logger.warn(`[ASSIGN] Prior caller ${priorLead.assignedToId} is inactive — falling through to normal assignment`);
                }
            }
        }

        // ── 1. Direct phone match (IVR / qkonnect) ────────────────────────
        if (agentNumber && !assignedUserId) {
            const normalized = normalizePhone(agentNumber);
            const caller = await this.userRepo.findOne({
                where: [
                    { phone: normalized, role: UserRole.LEAD_CALLER },
                    { phone: agentNumber, role: UserRole.LEAD_CALLER },
                ],
            });
            if (caller) {
                assignedUserId = caller.id;
                this.logger.log(`[ASSIGN] Direct phone match: "${caller.name}" (agentNumber="${agentNumber}")`);
            } else {
                this.logger.warn(`[ASSIGN] No LEAD_CALLER for agentNumber="${agentNumber}" — falling back to round-robin`);
            }
        }

        // ── 2. POPIN specificDetails match ────────────────────────────────
        if (!assignedUserId && lead.leadCategory === 'POPIN') {
            const agentPhone = lead.specificDetails?.agentPhone ?? lead.specificDetails?.agent_phone;
            if (agentPhone) {
                const caller = await this.userRepo.findOne({
                    where: { phone: normalizePhone(agentPhone), role: UserRole.LEAD_CALLER },
                });
                if (caller) {
                    assignedUserId = caller.id;
                    this.logger.log(`[ASSIGN] POPIN direct match: "${caller.name}"`);
                }
            }
        }

        // ── 3. Round-robin by category + region ───────────────────────────
        if (!assignedUserId) {
            // Default to WEBSITE if no category is set
            let category = lead.leadCategory;
            if (!category) {
                category = 'WEBSITE';
                await this.leadRecordRepo.update(leadId, { leadCategory: 'WEBSITE' });
                this.logger.warn(`[ASSIGN] Lead ${leadId} had no category — defaulted to WEBSITE`);
            }

            const callerCategory = this.categorisation.callerCategoryFor(category);
            if (!callerCategory) {
                this.logger.warn(`[ASSIGN] No callerCategory mapping for "${category}" — skipping`);
                return;
            }

            const region = await this.categorisation.cityToRegion(lead.customer?.city);
            const isRestOfIndia = region === 'REST_OF_INDIA';
            this.logger.log(`[ASSIGN] Round-robin: callerCat="${callerCategory}" region="${region}" isRestOfIndia=${isRestOfIndia}`);

            /**
             * Region filter logic:
             *  - Specific region (e.g. DELHI): prefer callers with DELHI, also accept REST_OF_INDIA
             *  - No city → REST_OF_INDIA: only callers explicitly covering REST_OF_INDIA
             *
             * In both cases NULL/empty regions are excluded — those are unconfigured callers
             * and should not receive assignments automatically.
             */
            const buildQuery = (requireShift: boolean, regionFilter: string) =>
                this.userRepo
                    .createQueryBuilder('u')
                    .where('u.role = :role', { role: UserRole.LEAD_CALLER })
                    .andWhere('u.caller_category = :cat', { cat: callerCategory })
                    .andWhere('CAST(u.caller_regions AS text) ILIKE :regionLike', { regionLike: `%${regionFilter}%` })
                    .andWhere('u.is_active = true')
                    .andWhere(requireShift ? 'u.is_on_shift = true' : '1=1')
                    .orderBy('u.last_assigned_at', 'ASC', 'NULLS FIRST');

            // Helper: try shift=true first, then shift=false
            const queryWithFallback = async (regionFilter: string): Promise<User[]> => {
                let callers = await buildQuery(true, regionFilter).getMany();
                this.logger.log(`[ASSIGN] On-shift callers (${regionFilter}): ${callers.length}`);
                if (callers.length === 0) {
                    callers = await buildQuery(false, regionFilter).getMany();
                    this.logger.warn(`[ASSIGN] Shift fallback (${regionFilter}): ${callers.length}`);
                }
                return callers;
            };

            let callers: User[] = [];

            if (!isRestOfIndia) {
                // Step 1: try to find callers for the specific region
                callers = await queryWithFallback(region);
            }

            if (callers.length === 0) {
                // Step 2: fall back to REST_OF_INDIA callers
                callers = await queryWithFallback('REST_OF_INDIA');
                if (callers.length > 0) {
                    this.logger.log(`[ASSIGN] Fell back to REST_OF_INDIA callers: ${callers.length}`);
                }
            }

            if (callers.length === 0) {
                const total = await this.userRepo.count({ where: { role: UserRole.LEAD_CALLER, isActive: true } });
                this.logger.warn(`[ASSIGN] ❌ Zero callers — total active LEAD_CALLERs in DB: ${total}`);
            }

            if (callers.length > 0) assignedUserId = callers[0].id;
        }

        // ── 4. Commit ─────────────────────────────────────────────────────
        if (assignedUserId) {
            const assignee = await this.userRepo.findOne({ where: { id: assignedUserId } });
            await this.leadRecordRepo.update(leadId, {
                assignedToId: assignedUserId,
                assignedToName: assignee?.name ?? '',
            });
            await this.userRepo.update(assignedUserId, { lastAssignedAt: new Date() });
            this.logger.log(`[ASSIGN] ✅ Lead ${leadId} → "${assignee?.name}" (${assignedUserId})`);
        } else {
            this.logger.warn(`[ASSIGN] ❌ Lead ${leadId}: no caller found after all fallbacks`);
        }
    }

    /** Thin wrapper so create() can fire-and-forget without changing its call site */
    private async autoAssignLead(lead: LeadRecord): Promise<void> {
        return this.assignLeadById(lead.id);
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
        if (query?.isHighPriority === true) {
            qb.andWhere('lr.is_high_priority = true');
        }
        if (query?.isUnassigned === true) {
            qb.andWhere('lr.assigned_to_id IS NULL');
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

        // Deduplicate by phone: show only the latest lead per customer phone number
        if (query.deduplicateByPhone) {
            qb.andWhere(`lr.id IN (
                SELECT DISTINCT ON (c.phone) lr2.id
                FROM lead_records lr2
                JOIN customers c ON c.id = lr2.customer_id
                WHERE c.phone IS NOT NULL AND c.phone <> ''
                ORDER BY c.phone, lr2.created_at DESC
            )`);
        }

        // Fetch paginated results
        const [leads, total] = await qb.getManyAndCount();

        // Add global duplicate count via a separate GROUP BY query — reliable across pagination
        if (leads.length > 0) {
            const customerIds = [...new Set(leads.map(l => l.customerId).filter(Boolean))];
            const countRows = await this.leadRecordRepo
                .createQueryBuilder('sub')
                .select('sub.customer_id', 'customerId')
                .addSelect('COUNT(sub.id)', 'cnt')
                .where('sub.customer_id IN (:...ids)', { ids: customerIds })
                .groupBy('sub.customer_id')
                .getRawMany();
            const countMap = new Map(countRows.map(r => [r.customerId, parseInt(r.cnt, 10)]));
            leads.forEach(lead => {
                (lead as any).totalLeadCount = countMap.get(lead.customerId) ?? 1;
            });
        }

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

        // Apply explicit status from form FIRST — so auto-advance below can still override 'new'
        if (dto.status !== undefined) lead.status = dto.status as LeadStatus;

        if (dto.call1 !== undefined) {
            lead.call1 = dto.call1;
            // Auto-advance status from 'new' → 'contacted' on first disposition, regardless of
            // what the form sent as status (form always echoes back the current status value)
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
        if (dto.preferredExperienceCenter !== undefined) lead.preferredExperienceCenter = dto.preferredExperienceCenter;
        if (dto.customerProductInterest !== undefined) lead.customerProductInterest = dto.customerProductInterest;
        if ((dto as any).consultationType !== undefined) lead.consultationType = (dto as any).consultationType;
        if (dto.nextActionDate) lead.nextActionDate = dto.nextActionDate; // only override if explicitly set (non-empty)
        if (dto.isHighPriority !== undefined) lead.isHighPriority = dto.isHighPriority;

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

        // ── Channelier Sync logic ───────────────────────────────────────
        if (dto.status === 'converted:Marked to HT' && dto.htCity && dto.htAgentId && dto.bookedDate && dto.bookedTimeSlot) {
            try {
                const agent = await this.userRepo.findOne({ where: { id: dto.htAgentId } });
                const customer = await this.customerRepo.findOne({ where: { id: lead.customerId } });
                
                if (agent?.channelierEmployeeId && customer) {
                    this.logger.log(`Syncing HT assignment to Channelier for lead ${id}`);
                    
                    // 1. Create Lead in CRM
                    const cLeadId = await this.channelierService.createLead({
                        customerName: customer.name || 'Unknown',
                        customerPhone: customer.phone,
                        city: dto.htCity,
                        address: customer.addressLine1 || dto.address || '',
                        contactPersonFirstName: customer.firstName || customer.name || 'Unknown',
                        state: 1, // Defaulting as required
                        cityId: 1, // Defaulting as required
                    });

                    // 2. Create Task linked to Lead & Agent
                    if (cLeadId) {
                        let scheduledTime: Date;
                        try {
                            const datePart = dto.bookedDate.split('T')[0];
                            scheduledTime = new Date(`${datePart} ${dto.bookedTimeSlot}`);
                            if (isNaN(scheduledTime.getTime())) scheduledTime = new Date(dto.bookedDate);
                        } catch {
                            scheduledTime = new Date(dto.bookedDate);
                        }

                        await this.channelierService.createTask({
                            channelierEmployeeId: agent.channelierEmployeeId,
                            leadId: cLeadId,
                            taskName: `Home Trial (${dto.consultationType || 'General'}): ${customer.name || 'Customer'}`,
                            scheduledTime,
                        });
                        this.logger.log(`Successfully synced HT task for lead ${id} to Channelier ID ${cLeadId}`);
                    }
                } else {
                    this.logger.warn(`Could not sync to Channelier: Agent missing Channelier ID or Customer not found. Lead id: ${id}`);
                }
            } catch (err: any) {
                this.logger.error(`Channelier Sync Failed for lead ${id}: ${err.message}`, err.stack);
                // We do NOT throw here because we don't want the HO form save to fail if Channelier is down
            }
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

    // ── Aging Dashboard ───────────────────────────────────────────────────
    async getAgingDashboard(): Promise<any> {
        const CATEGORIES = ['EC', 'HT', 'WEBSITE', 'POPIN', 'OTHER'];
        const BUCKETS    = ['0-3d', '4-7d', '8-14d', '15-30d', '30d+'];
        const STAGES     = ['fresh', 'contacted', 'reminder', 'revisit'];

        const rows: Array<{
            lead_category: string;
            is_revisit: boolean;
            next_action_date: string | null;
            call1: string | null;
            created_at: string;
        }> = await this.dataSource.query(`
            SELECT
                lead_category,
                is_revisit,
                next_action_date,
                call1,
                created_at
            FROM lead_records
            WHERE status NOT IN ('dropped','converted:Marked to EC','converted:Marked to HT','converted:Marked to VC')
        `);

        const now = Date.now();

        const getStage = (r: typeof rows[0]): string => {
            if (r.is_revisit) return 'revisit';
            if (r.next_action_date && new Date(r.next_action_date) <= new Date()) return 'reminder';
            if (!r.call1) return 'fresh';
            return 'contacted';
        };

        const getBucket = (ca: string): string => {
            const d = Math.floor((now - new Date(ca).getTime()) / 86400000);
            if (d <= 3)  return '0-3d';
            if (d <= 7)  return '4-7d';
            if (d <= 14) return '8-14d';
            if (d <= 30) return '15-30d';
            return '30d+';
        };

        const result = CATEGORIES.map(cat => {
            const catRows = rows.filter(r => {
                const lc = (r.lead_category ?? '').trim().toUpperCase();
                return cat === 'OTHER'
                    ? !['EC','HT','WEBSITE','POPIN'].includes(lc)
                    : lc === cat;
            });
            if (catRows.length === 0) return null;

            let totalDays = 0;
            const grid: Record<string, Record<string, number>> = {};
            STAGES.forEach(s => { grid[s] = {}; BUCKETS.forEach(b => { grid[s][b] = 0; }); });

            for (const r of catRows) {
                const stage  = getStage(r);
                const bucket = getBucket(r.created_at);
                grid[stage][bucket]++;
                totalDays += Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
            }

            return {
                category: cat,
                total: catRows.length,
                avgAgingDays: +(totalDays / catRows.length).toFixed(1),
                buckets: BUCKETS,
                stages: STAGES.map(s => ({
                    stage: s,
                    total: BUCKETS.reduce((acc, b) => acc + grid[s][b], 0),
                    bucketCounts: BUCKETS.map(b => grid[s][b]),
                })),
            };
        }).filter(Boolean);

        return { categories: result };
    }

    // ── Source Aging Dashboard ────────────────────────────────────────────────
    async getSourceAgingDashboard(): Promise<any> {
        const BUCKETS = ['0-3d', '4-7d', '8-14d', '15-30d', '30d+'];
        const STAGES  = ['fresh', 'contacted', 'reminder', 'revisit'];

        const rows: Array<{
            source: string | null;
            is_revisit: boolean;
            next_action_date: string | null;
            call1: string | null;
            created_at: string;
        }> = await this.dataSource.query(`
            SELECT
                source,
                is_revisit,
                next_action_date,
                call1,
                created_at
            FROM lead_records
            WHERE status NOT IN ('dropped','converted:Marked to EC','converted:Marked to HT','converted:Marked to VC')
        `);

        const now = Date.now();

        const getStage = (r: typeof rows[0]): string => {
            if (r.is_revisit) return 'revisit';
            if (r.next_action_date && new Date(r.next_action_date) <= new Date()) return 'reminder';
            if (!r.call1) return 'fresh';
            return 'contacted';
        };

        const getBucket = (ca: string): string => {
            const d = Math.floor((now - new Date(ca).getTime()) / 86400000);
            if (d <= 3)  return '0-3d';
            if (d <= 7)  return '4-7d';
            if (d <= 14) return '8-14d';
            if (d <= 30) return '15-30d';
            return '30d+';
        };

        // Group by source
        const sourceMap: Record<string, typeof rows> = {};
        for (const r of rows) {
            const src = (r.source ?? 'Unknown').trim() || 'Unknown';
            if (!sourceMap[src]) sourceMap[src] = [];
            sourceMap[src].push(r);
        }

        const result = Object.entries(sourceMap)
            .map(([source, sr]) => {
                let totalDays = 0;
                const grid: Record<string, Record<string, number>> = {};
                STAGES.forEach(s => { grid[s] = {}; BUCKETS.forEach(b => { grid[s][b] = 0; }); });

                for (const r of sr) {
                    grid[getStage(r)][getBucket(r.created_at)]++;
                    totalDays += Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
                }

                return {
                    source,
                    total: sr.length,
                    avgAgingDays: +(totalDays / sr.length).toFixed(1),
                    buckets: BUCKETS,
                    stages: STAGES.map(s => ({
                        stage: s,
                        total: BUCKETS.reduce((acc, b) => acc + grid[s][b], 0),
                        bucketCounts: BUCKETS.map(b => grid[s][b]),
                    })),
                };
            })
            .sort((a, b) => b.total - a.total); // biggest sources first

        return { sources: result };
    }

    // ── Caller Aging Dashboard ────────────────────────────────────────────────
    async getCallerAgingDashboard(): Promise<any> {
        const BUCKETS = ['0-3d', '4-7d', '8-14d', '15-30d', '30d+'];
        const STAGES  = ['fresh', 'contacted', 'reminder', 'revisit'];

        const rows: Array<{
            assigned_to_id: string | null;
            assigned_to_name: string | null;
            is_revisit: boolean;
            next_action_date: string | null;
            call1: string | null;
            created_at: string;
        }> = await this.dataSource.query(`
            SELECT
                assigned_to_id,
                assigned_to_name,
                is_revisit,
                next_action_date,
                call1,
                created_at
            FROM lead_records
            WHERE status NOT IN ('dropped','converted:Marked to EC','converted:Marked to HT','converted:Marked to VC')
        `);

        const now = Date.now();

        const getStage = (r: typeof rows[0]): string => {
            if (r.is_revisit) return 'revisit';
            if (r.next_action_date && new Date(r.next_action_date) <= new Date()) return 'reminder';
            if (!r.call1) return 'fresh';
            return 'contacted';
        };

        const getBucket = (ca: string): string => {
            const d = Math.floor((now - new Date(ca).getTime()) / 86400000);
            if (d <= 3)  return '0-3d';
            if (d <= 7)  return '4-7d';
            if (d <= 14) return '8-14d';
            if (d <= 30) return '15-30d';
            return '30d+';
        };

        // Group by caller
        const callerMap: Record<string, { name: string; rows: typeof rows }> = {};
        for (const r of rows) {
            const id   = r.assigned_to_id   ?? '__unassigned__';
            const name = r.assigned_to_name ?? 'Unassigned';
            if (!callerMap[id]) callerMap[id] = { name, rows: [] };
            callerMap[id].rows.push(r);
        }

        const result = Object.entries(callerMap).map(([callerId, { name, rows: cr }]) => {
            let totalDays = 0;
            const grid: Record<string, Record<string, number>> = {};
            STAGES.forEach(s => { grid[s] = {}; BUCKETS.forEach(b => { grid[s][b] = 0; }); });

            for (const r of cr) {
                grid[getStage(r)][getBucket(r.created_at)]++;
                totalDays += Math.floor((now - new Date(r.created_at).getTime()) / 86400000);
            }

            return {
                callerId,
                callerName: name,
                total: cr.length,
                avgAgingDays: +(totalDays / cr.length).toFixed(1),
                buckets: BUCKETS,
                stages: STAGES.map(s => ({
                    stage: s,
                    total: BUCKETS.reduce((acc, b) => acc + grid[s][b], 0),
                    bucketCounts: BUCKETS.map(b => grid[s][b]),
                })),
            };
        }).sort((a, b) => {
            if (a.callerId === '__unassigned__') return 1;
            if (b.callerId === '__unassigned__') return -1;
            return b.total - a.total;
        });

        return { callers: result };
    }

    // ── Shared computation for auto-assign (dry-run or commit) ───────────────
    private async _computeAutoAssign(onlineOnly = true) {
        // onlineOnly=true  → active + on-shift callers only
        // onlineOnly=false → all active callers regardless of shift status
        const callerWhere: any = { role: UserRole.LEAD_CALLER, isActive: true };
        if (onlineOnly) callerWhere.isOnShift = true;

        const allCallers = await this.userRepo.find({
            where: callerWhere,
            order: { lastAssignedAt: 'ASC' },
        });
        if (allCallers.length === 0) {
            const hint = onlineOnly
                ? 'No on-shift callers found. Start a shift or use onlineOnly=false to include offline callers.'
                : 'No active lead callers found in the system.';
            throw new BadRequestException(hint);
        }

        // ── 2. Build lookup pools keyed by "callerCategory|callerRegions[]" ──────
        // Pool keys:
        //   "EC_CALLER|DELHI_NCR"   → callers in EC category AND Delhi NCR region
        //   "EC_CALLER|__any__"     → all callers in EC category (any region)
        //   "__all__"               → all callers (final fallback)
        const poolMap: Record<string, User[]> = { '__all__': allCallers };

        for (const caller of allCallers) {
            const cat     = caller.callerCategory ?? null;
            const regions = caller.callerRegions ?? [];

            if (cat) {
                if (regions.length === 0) {
                    // No region restriction — serves any region (category-only pool)
                    const catKey = `${cat}|__any__`;
                    if (!poolMap[catKey]) poolMap[catKey] = [];
                    poolMap[catKey].push(caller);
                } else {
                    // Add to each specific region pool this caller covers
                    for (const region of regions) {
                        const bothKey = `${cat}|${region}`;
                        if (!poolMap[bothKey]) poolMap[bothKey] = [];
                        poolMap[bothKey].push(caller);
                    }
                }
            }
        }

        // ── 3. Fetch all unassigned, non-closed leads (oldest first) ──────────
        const unassigned = await this.leadRecordRepo.find({
            where: {
                assignedToId: IsNull(),
                status: Not(In(['dropped', 'converted:Marked to EC', 'converted:Marked to HT', 'converted:Marked to VC'])),
            },
            relations: ['customer'],   // ← required: city lookup needs customer.city
            order: { createdAt: 'ASC' },
        });


        // ── 4. Route each lead through the 3-tier matching ───────────────────
        const poolCounters: Record<string, number> = {};
        const callerCountMap: Record<string, { count: number; categories: Set<string>; regions: Set<string>; callerId: string }> = {};
        const assignments: Array<{ lead: typeof unassigned[0]; caller: User }> = [];
        let unroutable = 0;

        const pickFromPool = (poolKey: string): User | null => {
            const pool = poolMap[poolKey];
            if (!pool || pool.length === 0) return null;
            if (poolCounters[poolKey] === undefined) poolCounters[poolKey] = 0;
            const caller = pool[poolCounters[poolKey] % pool.length];
            poolCounters[poolKey]++;
            return caller;
        };

        for (const lead of unassigned) {
            // Derive category if missing — in-memory only, NOT persisted to DB
            let leadCat = (lead.leadCategory ?? '').trim().toUpperCase();
            if (!leadCat) {
                leadCat = this.categorisation
                    .deriveLeadCategory(lead.source, lead.pageType)
                    .toUpperCase();
            }

            const leadCity   = lead.customer?.city ?? '';
            const leadRegion = await this.categorisation.cityToRegion(leadCity);

            const targetCallerCat = this.categorisation.callerCategoryFor(leadCat);

            let caller: User | null = null;

            if (targetCallerCat) {
                // Tier 1: category + region (most specific)
                caller = pickFromPool(`${targetCallerCat}|${leadRegion}`);

                // Tier 2: category only (any region fallback)
                if (!caller) caller = pickFromPool(`${targetCallerCat}|__any__`);
            }

            // Tier 3: all active callers — fallback for unknown/uncategorised leads
            if (!caller) caller = pickFromPool('__all__');

            // No match → leave unassigned (admin will assign manually)
            if (!caller) { unroutable++; continue; }


            assignments.push({ lead, caller });

            if (!callerCountMap[caller.id])
                callerCountMap[caller.id] = { count: 0, categories: new Set(), regions: new Set(), callerId: caller.id };
            callerCountMap[caller.id].count++;
            callerCountMap[caller.id].categories.add(leadCat || 'Uncategorised');
            callerCountMap[caller.id].regions.add(leadRegion);
        }

        const breakdown = Object.entries(callerCountMap).map(([, info]) => {
            const caller = allCallers.find(c => c.id === info.callerId)!;
            return {
                callerName: caller.name,
                count: info.count,
                categories: Array.from(info.categories),
                regions: Array.from(info.regions),
            };
        });

        return { assignments, breakdown, unroutable, totalUnassigned: unassigned.length, callers: allCallers.length };
    }

    // ── Auto-Assign Preview (dry-run — no DB writes) ───────────────────────
    async autoAssignPreview(onlineOnly = true) {
        const { breakdown, unroutable, totalUnassigned, callers } = await this._computeAutoAssign(onlineOnly);
        return {
            preview: true,
            onlineOnly,
            totalUnassigned,
            willAssign: totalUnassigned - unroutable,
            unroutable,
            callers,
            breakdown,
        };
    }

    // ── Auto-Assign (commit) ───────────────────────────────────────────────
    async autoAssign(onlineOnly = true): Promise<{
        assigned: number; callers: number;
        breakdown: { callerName: string; count: number; categories: string[] }[];
        unroutable: number;
    }> {
        const { assignments, breakdown, unroutable, callers } = await this._computeAutoAssign(onlineOnly);

        if (assignments.length === 0)
            return { assigned: 0, callers, breakdown: [], unroutable };

        const historyEntries: Partial<LeadHistory>[] = [];
        for (const { lead, caller } of assignments) {
            lead.assignedToId = caller.id;
            lead.assignedToName = caller.name;
            historyEntries.push({
                leadRecordId: lead.id,
                fieldName: 'Assigned To',
                oldValue: '',
                newValue: caller.name,
            });
        }

        await this.leadRecordRepo.save(assignments.map(a => a.lead));
        if (historyEntries.length > 0)
            await this.leadHistoryRepo.save(historyEntries.map(e => this.leadHistoryRepo.create(e)));

        const assigned = assignments.length;
        this.logger.log(`Smart auto-assigned ${assigned} leads across ${callers} callers (${unroutable} unroutable)`);
        return { assigned, callers, breakdown, unroutable };
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
    // ── Bulk-Assign Qkonnect / Inbound IVR Leads ──────────────────────────
    async bulkAssignQkonnectLeads(): Promise<{ assigned: number; skipped: number; details: any[] }> {
        // Find all IVR / qkonnect leads (assigned or not — re-assign to the last caller)
        const ivrSources = ['Inbound IVR', 'IVR', 'Qkonnect', 'inbound_ivr'];
        const leads = await this.leadRecordRepo.createQueryBuilder('lr')
            .where('lr.source IN (:...sources)', { sources: ivrSources })
            .getMany();

        this.logger.log(`[BULK-ASSIGN] Found ${leads.length} IVR/qkonnect leads to process`);

        let assigned = 0;
        let skipped = 0;
        const details: any[] = [];

        for (const lead of leads) {
            // Find the most recent call log for the associated customer
            const recentLog = await this.callLogRepo.findOne({
                where: { customerId: lead.customerId },
                order: { createdAt: 'DESC' },
            });

            if (!recentLog) {
                skipped++;
                details.push({ leadId: lead.id, reason: 'no_call_log' });
                continue;
            }

            let agentUser: User | null = null;

            if (recentLog.agentId) {
                agentUser = await this.userRepo.findOne({ where: { id: recentLog.agentId } });
            }

            if (!agentUser && recentLog.agentNumber) {
                agentUser = await this.userRepo.findOne({
                    where: { phone: normalizePhone(recentLog.agentNumber), role: UserRole.LEAD_CALLER },
                });
            }

            if (!agentUser) {
                skipped++;
                details.push({ leadId: lead.id, reason: 'agent_not_found', agentNumber: recentLog.agentNumber });
                continue;
            }

            await this.leadRecordRepo.update(lead.id, {
                assignedToId: agentUser.id,
                assignedToName: agentUser.name,
            });
            assigned++;
            details.push({ leadId: lead.id, assignedTo: agentUser.name, agentId: agentUser.id });
            this.logger.log(`[BULK-ASSIGN] Lead ${lead.id} → "${agentUser.name}"`);
        }

        this.logger.log(`[BULK-ASSIGN] Done: ${assigned} assigned, ${skipped} skipped`);
        return { assigned, skipped, details };
    }

    // ── LeadSquared Excel Import ──────────────────────────────────────────────
    async importFromLeadSquared(
        fileBuffer: Buffer,
        targetStatus: string,
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const XLSX = require('xlsx');

        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Pre-load all users for agent lookup (email & phone)
        const allUsers = await this.userRepo.find();
        const userByEmail = new Map<string, User>();
        const userByPhone = new Map<string, User>();
        for (const u of allUsers) {
            if (u.email) userByEmail.set(u.email.toLowerCase().trim(), u);
            if (u.phone) userByPhone.set(normalizePhone(u.phone), u);
        }

        for (let i = 0; i < rows.length; i++) {
            const rawRow = rows[i];
            const rowNum = i + 2; // 1-indexed + header
            
            // Fix Excel/CSV header issues: totally strip spaces, casing, and weird chars
            const row: Record<string, any> = {};
            for (const key of Object.keys(rawRow)) {
                const cleanKey = key.toLowerCase()
                                    .replace(/[\s_]+/g, '')
                                    .replace(/\r?\n|\r/g, '')
                                    .replace(/[\u200B-\u200D\uFEFF]/g, '');
                row[cleanKey] = rawRow[key];
            }

            try {
                // ── 1. Phone normalization ────────────────────────────────────
                const rawPhone = String(row['customermobilenumber'] ?? row['mobile'] ?? '').trim();
                if (!rawPhone) {
                    skipped++;
                    errors.push(`Row ${rowNum}: skipped — no phone number`);
                    continue;
                }
                const phone = normalizePhone(rawPhone);

                // ── 2. Name ───────────────────────────────────────────────────
                const firstName = String(row['customerfirstname'] ?? row['firstname'] ?? '').trim();
                const lastName = String(row['customerlastname'] ?? row['lastname'] ?? '').trim();
                const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';

                // ── 3. Source ─────────────────────────────────────────────────
                const source = String(row['leadsource'] ?? row['source'] ?? 'LeadSquared').trim();

                // ── 4. Agent lookup ───────────────────────────────────────────
                let agentUser: User | undefined;
                const agentPhone = String(
                    row['agentmobilenumber'] ?? 
                    row['agentnumber'] ?? 
                    row['agentphone'] ?? 
                    row['agent'] ?? 
                    row['ownerphone'] ?? 
                    row['ownermobilenumber'] ?? 
                    row['owner'] ?? 
                    ''
                ).trim();

                this.logger.log(`[LS-IMPORT-DEBUG] Row ${rowNum}: Raw Agent Phone from CSV = '${agentPhone}'`);

                if (agentPhone) {
                    const normPhone = normalizePhone(agentPhone);
                    this.logger.log(`[LS-IMPORT-DEBUG] Row ${rowNum}: Searching DB for normalized phone = '${normPhone}'`);
                    agentUser = userByPhone.get(normPhone);
                    this.logger.log(`[LS-IMPORT-DEBUG] Row ${rowNum}: Search result = ${agentUser ? `SUCCESS (User ID: ${agentUser.id}, Name: ${agentUser.name})` : 'FAILED (Not Found)'}`);
                }

                // ✨ Diagnostic Error for the UI: ✨
                if (!agentUser) {
                    if (!agentPhone) {
                        errors.push(`Row ${rowNum}: No Agent Phone found in columns (or column missing)`);
                    } else {
                        errors.push(`Row ${rowNum}: Agent not found in system for Phone: '${agentPhone}' (normalized: ${normalizePhone(agentPhone)})`);
                    }
                }

                // ── 5. Customer find-or-create ────────────────────────────────
                let customer = await this.customerRepo.findOne({ where: { phone } });
                if (!customer) {
                    customer = this.customerRepo.create({ name: fullName, phone });
                    customer = await this.customerRepo.save(customer);
                } else if (customer.name === 'Unknown' || !customer.name) {
                    customer.name = fullName;
                    customer = await this.customerRepo.save(customer);
                } else {
                    // Update name if we have a better value
                    customer.name = fullName;
                    customer = await this.customerRepo.save(customer);
                }

                // ── 6. Category Mapping ───────────────────────────────────────
                const rawCategory = String(row['category'] ?? '').trim().toLowerCase();
                let leadCategory: string | undefined;
                if (rawCategory === 'home trial' || rawCategory === 'ht') leadCategory = 'HT';
                else if (rawCategory === 'popins' || rawCategory === 'popin') leadCategory = 'POPIN';
                else if (rawCategory === 'website') leadCategory = 'WEBSITE';
                else if (rawCategory === 'ec' || rawCategory === 'experience center') leadCategory = 'EC';

                // ── 7. Lead find-or-create ────────────────────────────────────
                const existingLead = await this.leadRecordRepo.findOne({
                    where: { customerId: customer.id },
                    order: { createdAt: 'DESC' },
                });

                if (existingLead) {
                    // Update existing lead
                    existingLead.status = targetStatus as LeadStatus;
                    if (agentUser) {
                        existingLead.assignedToId = agentUser.id;
                        existingLead.assignedToName = agentUser.name;
                    }
                    existingLead.source = source;
                    if (leadCategory) existingLead.leadCategory = leadCategory;
                    await this.leadRecordRepo.save(existingLead);
                    updated++;
                    this.logger.log(`[LS-IMPORT] Updated lead ${existingLead.id} for phone ${phone}`);
                } else {
                    // Create new lead
                    const isRevisit = false; // new customer, not a revisit
                    const lead = this.leadRecordRepo.create({
                        customerId: customer.id,
                        status: targetStatus as LeadStatus,
                        source,
                        isRevisit,
                        leadCategory,
                        assignedToId: agentUser?.id ?? (null as any),
                        assignedToName: agentUser?.name ?? '',
                    });
                    await this.leadRecordRepo.save(lead);
                    created++;
                    this.logger.log(`[LS-IMPORT] Created lead for phone ${phone}`);
                }
            } catch (err: any) {
                errors.push(`Row ${rowNum}: ${err?.message ?? 'Unknown error'}`);
                this.logger.error(`[LS-IMPORT] Row ${rowNum} failed: ${err?.message}`);
            }
        }

        this.logger.log(`[LS-IMPORT] Done — created: ${created}, updated: ${updated}, skipped: ${skipped}, errors: ${errors.length}`);
        return { created, updated, skipped, errors };
    }
}
