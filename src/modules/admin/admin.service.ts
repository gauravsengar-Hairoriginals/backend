import { Injectable, ConflictException, NotFoundException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { CallerCategory } from '../users/enums/caller-category.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateLeadCallerDto } from './dto/update-lead-caller.dto';
import { ReferralsService } from '../referrals/referrals.service';
import { SalonsService } from '../salons/salons.service';
import { ReferralStatus } from '../referrals/entities/referral.entity';
import { DiscountsService } from '../discounts/discounts.service';
import { UsersService } from '../users/users.service';
import { ExperienceCenter } from './entities/experience-center.entity';
import { CityRegion } from './entities/city-region.entity';

@Injectable()
export class AdminService implements OnModuleInit {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(ExperienceCenter)
        private readonly ecRepository: Repository<ExperienceCenter>,
        @InjectRepository(CityRegion)
        private readonly cityRegionRepo: Repository<CityRegion>,
        private readonly referralsService: ReferralsService,
        private readonly salonsService: SalonsService,
        private readonly discountsService: DiscountsService,
    ) { }

    async onModuleInit() {
        await this.seedDefaultCityRegions();
    }

    private async seedDefaultCityRegions(): Promise<void> {
        const count = await this.cityRegionRepo.count();
        if (count > 0) return; // Already seeded

        const defaults = [
            { regionCode: 'DELHI_NCR', regionName: 'Delhi NCR', cities: ['delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad', 'greater noida'] },
            { regionCode: 'HYDERABAD', regionName: 'Hyderabad', cities: ['hyderabad', 'secunderabad', 'cyberabad'] },
            { regionCode: 'MUMBAI',    regionName: 'Mumbai',    cities: ['mumbai', 'thane', 'navi mumbai', 'kalyan', 'dombivli'] },
            { regionCode: 'REST_OF_INDIA', regionName: 'Rest of India', cities: [] },
        ];

        for (const d of defaults) {
            await this.cityRegionRepo.save(this.cityRegionRepo.create({ ...d, isActive: true }));
        }
    }

    async getDashboardStats(user: User) {
        // Example: Only fetch financial stats if user has VIEW_FINANCIALS permission
        // For now, simpler implementation
        return {
            message: 'Dashboard stats placeholder',
            role: user.role,
            permissions: user.permissions
        };
    }

    async createAdmin(dto: CreateAdminDto): Promise<User> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('User with this email already exists');
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);

        const admin = this.userRepository.create({
            email: dto.email,
            phone: normalizePhone(dto.phone),
            name: dto.name,
            passwordHash,
            role: UserRole.ADMIN,
            permissions: dto.permissions || [],
            isActive: true,
        });

        return this.userRepository.save(admin);
    }

    async listAdmins(): Promise<User[]> {
        return this.userRepository.find({
            where: { role: UserRole.ADMIN },
            select: ['id', 'name', 'email', 'phone', 'role', 'permissions', 'isActive', 'createdAt']
        });
    }

    async toggleAdminStatus(id: string): Promise<{ isActive: boolean }> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException('Admin not found');
        user.isActive = !user.isActive;
        await this.userRepository.save(user);
        return { isActive: user.isActive };
    }

    async resetAdminPassword(id: string): Promise<{ temporaryPassword: string }> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException('Admin not found');
        const temporaryPassword = Math.random().toString(36).slice(-10);
        user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
        await this.userRepository.save(user);
        return { temporaryPassword };
    }

    async updateAdminPermissions(id: string, permissions: string[]): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException('Admin not found');
        user.permissions = permissions;
        return this.userRepository.save(user);
    }

    async listStylists(search?: string, status?: string): Promise<User[]> {
        const query = this.userRepository.createQueryBuilder('user')
            .where('user.role = :role', { role: UserRole.STYLIST })
            .leftJoinAndSelect('user.salon', 'salon')
            // Load counts
            .loadRelationCountAndMap('user.referralsCount', 'user.referrals')
            .loadRelationCountAndMap('user.redeemedCount', 'user.referrals', 'referral', (qb) =>
                qb.where('referral.status IN (:...statuses)', { statuses: ['redeemed', 'credited'] })
                    .orWhere('referral.orderId IS NOT NULL')
            );

        if (search) {
            query.andWhere('(user.name ILIKE :search OR user.phone ILIKE :search OR user.email ILIKE :search)', { search: `%${search}%` });
        }

        if (status === 'active') {
            query.andWhere('user.isActive = :isActive', { isActive: true });
        } else if (status === 'inactive') {
            query.andWhere('user.isActive = :isActive', { isActive: false });
        }

        return query.orderBy('user.createdAt', 'DESC').getMany();
    }

    async getStylistReferrals(stylistId: string): Promise<any[]> {
        return this.referralsService.findByReferrer(stylistId);
    }

    async updateStylistStatus(id: string, isApproved: boolean): Promise<User> {
        const stylist = await this.userRepository.findOne({ where: { id, role: UserRole.STYLIST } });
        if (!stylist) {
            throw new NotFoundException('Stylist not found');
        }

        stylist.isActive = isApproved;
        return this.userRepository.save(stylist);
    }

    async updateStylistLevel(id: string, level: any): Promise<User> {
        const stylist = await this.userRepository.findOne({ where: { id, role: UserRole.STYLIST } });
        if (!stylist) {
            throw new NotFoundException('Stylist not found');
        }

        stylist.level = level;
        return this.userRepository.save(stylist);
    }

    async listSalons(search?: string) {
        return this.salonsService.findAll(search);
    }

    async createSalon(createSalonDto: any) {
        return this.salonsService.create(createSalonDto);
    }

    async updateSalonLevel(id: string, level: any) {
        return this.salonsService.update(id, { level });
    }

    async listReferrals(status?: string, page: number = 1, limit: number = 20, salonPhone?: string, code?: string, stylistPhone?: string) {
        return this.referralsService.findAllAdmin({ status, page, limit, salonPhone, code, stylistPhone });
    }

    async bulkCreditReferrals(referralIds: string[]) {
        return this.referralsService.bulkCredit(referralIds);
    }

    async updateCommission(id: string, amount: number) {
        return this.referralsService.updateCommission(id, amount);
    }

    async updateDiscountStatus(id: string, status: any) {
        return this.discountsService.updateStatus(id, status);
    }

    // ── Lead Caller Management ────────────────────────────────────────────

    async createLeadCaller(dto: {
        name: string;
        email: string;
        phone: string;
        password?: string;
        callerCategory?: CallerCategory;
        callerRegions?: string[];
    }): Promise<Omit<User, 'passwordHash'>> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('A user with this email already exists');
        }

        const rawPassword = dto.password || Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(rawPassword, 10);

        const callerData: Partial<User> = {
            name: dto.name,
            email: dto.email.trim().toLowerCase(),
            phone: normalizePhone(dto.phone),
            passwordHash,
            role: UserRole.LEAD_CALLER,
            isActive: true,
        };
        if (dto.callerCategory) callerData.callerCategory = dto.callerCategory;
        if (dto.callerRegions)   callerData.callerRegions  = dto.callerRegions;

        const caller = this.userRepository.create(callerData as any);

        const saved = await this.userRepository.save(caller);
        return { ...saved, passwordHash: rawPassword } as any;
    }

    async listLeadCallers(search?: string): Promise<User[]> {
        const qb = this.userRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: UserRole.LEAD_CALLER })
            .select([
                'user.id', 'user.name', 'user.email', 'user.phone',
                'user.isActive', 'user.createdAt', 'user.callerCategory',
                'user.callerRegions', 'user.isOnShift', 'user.shiftStartedAt',
            ]);

        if (search) {
            qb.andWhere(
                '(user.name ILIKE :s OR user.phone ILIKE :s OR user.email ILIKE :s)',
                { s: `%${search}%` },
            );
        }

        return qb.orderBy('user.createdAt', 'DESC').getMany();
    }

    async toggleLeadCallerStatus(id: string, isActive: boolean): Promise<User> {
        const caller = await this.userRepository.findOne({ where: { id, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');
        caller.isActive = isActive;
        return this.userRepository.save(caller);
    }

    async updateLeadCaller(id: string, dto: UpdateLeadCallerDto): Promise<User> {
        const caller = await this.userRepository.findOne({ where: { id, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');

        // Guard against duplicate email
        if (dto.email && dto.email.trim().toLowerCase() !== caller.email) {
            const conflict = await this.userRepository.findOne({ where: { email: dto.email.trim().toLowerCase() } });
            if (conflict) throw new ConflictException('Email already in use by another user');
        }

        if (dto.name)                        caller.name           = dto.name.trim();
        if (dto.email)                       caller.email          = dto.email.trim().toLowerCase();
        if (dto.phone)                       caller.phone          = normalizePhone(dto.phone);
        if (dto.callerCategory  !== undefined) caller.callerCategory  = dto.callerCategory;
        if (dto.callerRegions   !== undefined) caller.callerRegions   = dto.callerRegions;
        if (dto.password && dto.password.trim()) {
            caller.passwordHash = await bcrypt.hash(dto.password.trim(), 10);
        }

        return this.userRepository.save(caller);
    }

    async resetLeadCallerPassword(id: string, newPassword: string): Promise<{ success: boolean }> {
        const caller = await this.userRepository.findOne({ where: { id, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');
        caller.passwordHash = await bcrypt.hash(newPassword, 10);
        await this.userRepository.save(caller);
        return { success: true };
    }

    // ── Shift Management ──────────────────────────────────────────────────

    async startShift(callerId: string): Promise<User> {
        const caller = await this.userRepository.findOne({ where: { id: callerId, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');
        caller.isOnShift = true;
        caller.shiftStartedAt = new Date();
        return this.userRepository.save(caller);
    }

    async endShift(callerId: string): Promise<User> {
        const caller = await this.userRepository.findOne({ where: { id: callerId, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');
        caller.isOnShift = false;
        return this.userRepository.save(caller);
    }

    /** Called by the cron job at 18:00 IST to auto-logout non-international callers */
    async autoEndShifts(): Promise<void> {
        await this.userRepository
            .createQueryBuilder()
            .update(User)
            .set({ isOnShift: false })
            .where('role = :role AND is_on_shift = true AND (caller_category IS NULL OR caller_category != :intl)', {
                role: UserRole.LEAD_CALLER,
                intl: CallerCategory.INTERNATIONAL_CALLER,
            })
            .execute();
    }

    // ── Experience Centers Management ─────────────────────────────────────

    async createExperienceCenter(dto: Partial<ExperienceCenter>): Promise<ExperienceCenter> {
        const ec = this.ecRepository.create(dto);
        return this.ecRepository.save(ec);
    }

    async listExperienceCenters(search?: string, isActive?: boolean): Promise<ExperienceCenter[]> {
        const qb = this.ecRepository.createQueryBuilder('ec');

        if (search) {
            qb.andWhere('(ec.name ILIKE :search OR ec.city ILIKE :search OR ec.managerName ILIKE :search)', { search: `%${search}%` });
        }

        if (isActive !== undefined) {
            qb.andWhere('ec.isActive = :isActive', { isActive });
        }

        return qb.orderBy('ec.createdAt', 'DESC').getMany();
    }

    async updateExperienceCenter(id: string, dto: Partial<ExperienceCenter> & {
        dinggAccessCode?: string;
        dinggApiKey?: string;
    }): Promise<ExperienceCenter> {
        // Reload with secrets (select:false columns not included by default)
        const ec = await this.ecRepository
            .createQueryBuilder('ec')
            .addSelect(['ec.dinggAccessCode', 'ec.dinggApiKey', 'ec.dinggToken'])
            .where('ec.id = :id', { id })
            .getOne();
        if (!ec) throw new NotFoundException('Experience Center not found');

        // Apply all standard fields
        const { dinggAccessCode, dinggApiKey, ...rest } = dto as any;
        Object.assign(ec, rest);

        // Apply credential fields explicitly (they are select:false, Object.assign misses them)
        if (dinggAccessCode !== undefined) ec.dinggAccessCode = dinggAccessCode;
        if (dinggApiKey     !== undefined) ec.dinggApiKey     = dinggApiKey;

        // If credentials change, clear cached token so it's refreshed on next use
        if (dinggAccessCode !== undefined || dinggApiKey !== undefined) {
            ec.dinggToken = null;
            ec.dinggTokenExpiresAt = null;
        }

        const saved = await this.ecRepository.save(ec);
        // Return without exposing secrets
        delete (saved as any).dinggAccessCode;
        delete (saved as any).dinggApiKey;
        delete (saved as any).dinggToken;
        return saved;
    }

    async toggleExperienceCenterStatus(id: string, isActive: boolean): Promise<ExperienceCenter> {
        const ec = await this.ecRepository.findOne({ where: { id } });
        if (!ec) {
            throw new NotFoundException('Experience Center not found');
        }
        ec.isActive = isActive;
        return this.ecRepository.save(ec);
    }

    // ── EC Stylist Management ─────────────────────────────────────────────

    async getStylistsInEC(ecId: string): Promise<User[]> {
        const ec = await this.ecRepository.findOne({ where: { id: ecId } });
        if (!ec) throw new NotFoundException('Experience Center not found');

        return this.userRepository.find({
            where: { ecId, role: UserRole.STYLIST },
            select: ['id', 'name', 'phone', 'email', 'isActive', 'level'],
        });
    }

    async addStylistToECByPhone(ecId: string, phone: string, name?: string): Promise<User[]> {
        const ec = await this.ecRepository.findOne({ where: { id: ecId } });
        if (!ec) throw new NotFoundException('Experience Center not found');

        const normalized = normalizePhone(phone);
        let stylist = await this.userRepository.findOne({ where: { phone: normalized } });

        if (!stylist) {
            // Create new stylist user
            const hashedPassword = await bcrypt.hash('Welcome@123', 12);
            stylist = this.userRepository.create({
                name: name || 'Stylist',
                phone: normalized,
                role: UserRole.STYLIST,
                passwordHash: hashedPassword,
                isActive: true,
                isPhoneVerified: true,
            });
            stylist = await this.userRepository.save(stylist);
        } else if (stylist.role !== UserRole.STYLIST) {
            throw new BadRequestException(`User with phone ${phone} has role '${stylist.role}' and cannot be added as a stylist`);
        }

        stylist.ecId = ecId;
        await this.userRepository.save(stylist);

        return this.getStylistsInEC(ecId);
    }

    async removeStylistFromEC(ecId: string, stylistId: string): Promise<User[]> {
        const stylist = await this.userRepository.findOne({
            where: { id: stylistId, ecId },
        });

        if (!stylist) {
            throw new NotFoundException(`Stylist with ID ${stylistId} not found in this Experience Center`);
        }

        stylist.ecId = null as any;
        await this.userRepository.save(stylist);

        return this.getStylistsInEC(ecId);
    }

    /** Test DINGG connection for an EC — calls generate-token and returns success/fail */
    async testDinggConnection(id: string): Promise<{ success: boolean; message: string }> {
        const ec = await this.ecRepository
            .createQueryBuilder('ec')
            .addSelect(['ec.dinggAccessCode', 'ec.dinggApiKey'])
            .where('ec.id = :id', { id })
            .getOne();
        if (!ec) throw new NotFoundException('Experience Center not found');
        if (!ec.dinggAccessCode || !ec.dinggApiKey) {
            throw new BadRequestException('DINGG credentials not configured for this EC');
        }

        const baseUrl = process.env.DINGG_BASE_URL ?? 'https://api.dingg.app';
        try {
            const res = await fetch(`${baseUrl}/tech-partner/generate-token`, {
                method: 'POST',
                headers: {
                    access_code: ec.dinggAccessCode,
                    api_key:     ec.dinggApiKey,
                    'Content-Type': 'application/json',
                },
            });
            const json: any = await res.json();
            if (!res.ok || !json?.token) {
                return { success: false, message: `DINGG returned: ${JSON.stringify(json)}` };
            }
            // Cache the working token
            const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 h
            await this.ecRepository.update(id, {
                dinggToken: json.token,
                dinggTokenExpiresAt: expiresAt,
                dinggEnabled: true,
            } as any);
            return { success: true, message: `Token obtained and cached. Expires: ${expiresAt.toISOString()}` };
        } catch (err: any) {
            return { success: false, message: `Network error: ${err.message}` };
        }
    }

    // ── City Region Management ────────────────────────────────────────────

    async listCityRegions(): Promise<CityRegion[]> {
        return this.cityRegionRepo.find({ order: { regionName: 'ASC' } });
    }

    async createCityRegion(dto: { regionCode: string; regionName: string; cities?: string[] }): Promise<CityRegion> {
        const existing = await this.cityRegionRepo.findOne({ where: { regionCode: dto.regionCode.toUpperCase() } });
        if (existing) throw new ConflictException(`Region code "${dto.regionCode}" already exists`);
        const region = this.cityRegionRepo.create({
            regionCode: dto.regionCode.toUpperCase().replace(/\s+/g, '_'),
            regionName: dto.regionName,
            cities: (dto.cities ?? []).map(c => c.trim().toLowerCase()).filter(Boolean),
            isActive: true,
        });
        return this.cityRegionRepo.save(region);
    }

    async updateCityRegion(id: string, dto: { regionName?: string; cities?: string[]; isActive?: boolean }): Promise<CityRegion> {
        const region = await this.cityRegionRepo.findOne({ where: { id } });
        if (!region) throw new NotFoundException('City region not found');
        if (dto.regionName !== undefined) region.regionName = dto.regionName;
        if (dto.cities !== undefined) region.cities = dto.cities.map(c => c.trim().toLowerCase()).filter(Boolean);
        if (dto.isActive !== undefined) region.isActive = dto.isActive;
        return this.cityRegionRepo.save(region);
    }

    async deleteCityRegion(id: string): Promise<{ success: boolean }> {
        const region = await this.cityRegionRepo.findOne({ where: { id } });
        if (!region) throw new NotFoundException('City region not found');
        await this.cityRegionRepo.remove(region);
        return { success: true };
    }

    /** Used by LeadCategorisationService to resolve city → regionCode */
    async getActiveCityRegions(): Promise<CityRegion[]> {
        return this.cityRegionRepo.find({ where: { isActive: true }, order: { regionName: 'ASC' } });
    }
}

