import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { normalizePhone } from '../../common/utils/phone.util';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ReferralsService } from '../referrals/referrals.service';
import { SalonsService } from '../salons/salons.service';
import { ReferralStatus } from '../referrals/entities/referral.entity';
import { DiscountsService } from '../discounts/discounts.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly referralsService: ReferralsService,
        private readonly salonsService: SalonsService,
        private readonly discountsService: DiscountsService,
    ) { }

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
    }): Promise<Omit<User, 'passwordHash'>> {
        const existing = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existing) {
            throw new ConflictException('A user with this email already exists');
        }

        const rawPassword = dto.password || Math.random().toString(36).slice(-8); // auto-generate if not provided
        const passwordHash = await bcrypt.hash(rawPassword, 10);

        const caller = this.userRepository.create({
            name: dto.name,
            email: dto.email.trim().toLowerCase(),
            phone: normalizePhone(dto.phone),
            passwordHash,
            role: UserRole.LEAD_CALLER,
            isActive: true,
        });

        const saved = await this.userRepository.save(caller);

        // Return the new user + the plain-text password so admin can share it
        return { ...saved, passwordHash: rawPassword } as any;
    }

    async listLeadCallers(search?: string): Promise<User[]> {
        const qb = this.userRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: UserRole.LEAD_CALLER })
            .select(['user.id', 'user.name', 'user.email', 'user.phone', 'user.isActive', 'user.createdAt']);

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

    async resetLeadCallerPassword(id: string, newPassword: string): Promise<{ success: boolean }> {
        const caller = await this.userRepository.findOne({ where: { id, role: UserRole.LEAD_CALLER } });
        if (!caller) throw new NotFoundException('Lead caller not found');
        caller.passwordHash = await bcrypt.hash(newPassword, 10);
        await this.userRepository.save(caller);
        return { success: true };
    }
}

