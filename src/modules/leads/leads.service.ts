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
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto } from './dto/create-lead.dto';
import { normalizePhone } from '../../common/utils/phone.util';

export interface LeadsQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    assignedToId?: string;
}

@Injectable()
export class LeadsService {
    private readonly logger = new Logger(LeadsService.name);

    constructor(
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(LeadRecord)
        private readonly leadRecordRepo: Repository<LeadRecord>,
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
                status: LeadStatus.NEW,
            });

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

    // ── Update ────────────────────────────────────────────────────────────
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
        if (dto.call1 !== undefined) lead.call1 = dto.call1;
        if (dto.call2 !== undefined) lead.call2 = dto.call2;
        if (dto.call3 !== undefined) lead.call3 = dto.call3;
        if (dto.remarks !== undefined) lead.remarks = dto.remarks;
        if (dto.scheduled !== undefined) lead.scheduled = dto.scheduled;
        if (dto.selectedDate !== undefined) lead.selectedDate = dto.selectedDate;
        if (dto.timeSlot !== undefined) lead.timeSlot = dto.timeSlot;
        if (dto.appointmentBooked !== undefined) lead.appointmentBooked = dto.appointmentBooked;
        if (dto.bookedDate !== undefined) lead.bookedDate = dto.bookedDate;
        if (dto.status !== undefined) lead.status = dto.status as LeadStatus;
        if (dto.preferredExperienceCenter !== undefined) lead.preferredExperienceCenter = dto.preferredExperienceCenter;
        if (dto.nextActionDate !== undefined) lead.nextActionDate = dto.nextActionDate;
        if (dto.preferredProducts !== undefined) lead.preferredProducts = dto.preferredProducts;
        if (dto.preferredProductOptions !== undefined) lead.preferredProductOptions = dto.preferredProductOptions;

        const saved = await this.leadRecordRepo.save(lead);
        return this.leadRecordRepo.findOne({
            where: { id: saved.id },
            relations: ['customer', 'assignedTo'],
        }) as Promise<LeadRecord>;
    }

    // ── Assign ────────────────────────────────────────────────────────────
    async assignLead(id: string, dto: AssignLeadDto): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({ where: { id } });
        if (!lead) throw new NotFoundException('Lead not found');

        const caller = await this.userRepo.findOne({
            where: { id: dto.callerId, role: UserRole.LEAD_CALLER },
        });
        if (!caller) throw new NotFoundException('Lead caller not found');

        lead.assignedToId = caller.id;
        lead.assignedToName = caller.name;
        const savedAssign = await this.leadRecordRepo.save(lead);
        return this.leadRecordRepo.findOne({
            where: { id: savedAssign.id },
            relations: ['customer', 'assignedTo'],
        }) as Promise<LeadRecord>;
    }

    // ── Convert ───────────────────────────────────────────────────────────
    async convertLead(id: string): Promise<LeadRecord> {
        const lead = await this.leadRecordRepo.findOne({ where: { id }, relations: ['customer'] });
        if (!lead) throw new NotFoundException('Lead not found');
        if (lead.status === LeadStatus.CONVERTED) {
            throw new BadRequestException('Lead is already converted');
        }

        lead.status = LeadStatus.CONVERTED;
        lead.convertedAt = new Date();

        const customer = lead.customer;
        if (!customer.tags?.includes('customer')) {
            customer.tags = [...(customer.tags || []), 'customer'];
            await this.customerRepo.save(customer);
        }

        const savedConvert = await this.leadRecordRepo.save(lead);
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
