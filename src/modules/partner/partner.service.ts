import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Salon } from '../salons/entities/salon.entity';
import { Referral, ReferralStatus } from '../referrals/entities/referral.entity';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/enums/user-role.enum';
import { SalonsService } from '../salons/salons.service';

@Injectable()
export class PartnerService {
    constructor(
        @InjectRepository(Salon)
        private readonly salonRepository: Repository<Salon>,
        @InjectRepository(Referral)
        private readonly referralRepository: Repository<Referral>,
        private readonly usersService: UsersService,
        private readonly salonsService: SalonsService,
    ) { }

    async getDashboardStats(owner: User) {
        // 1. Get all salons owned by this user
        const salons = await this.salonRepository.find({
            where: { ownerId: owner.id },
            relations: ['stylists']
        });

        const totalSalons = salons.length;
        const totalStylists = salons.reduce((acc, salon) => acc + (salon.stylists?.length || 0), 0);
        const salonIds = salons.map(s => s.id);

        if (totalSalons === 0) {
            return {
                totalSalons,
                totalStylists,
                totalEarnings: 0,
                pendingEarnings: 0,
                totalReferrals: 0,
                salons: []
            };
        }

        // 2. Get referrals from these salons (where referrer.salonId is in salonIds)
        // We need to join referrer and salon
        const referrals = await this.referralRepository.createQueryBuilder('referral')
            .leftJoin('referral.referrer', 'referrer')
            .where('referrer.salonId IN (:...salonIds)', { salonIds })
            .getMany();

        const totalReferrals = referrals.length;

        // 3. Calculate Earnings based on actualSalonCommission
        // Total Earnings = Status CREDITED
        const totalEarnings = referrals
            .filter(r => r.status === ReferralStatus.CREDITED)
            .reduce((sum, r) => sum + Number(r.actualSalonCommission || 0), 0);

        // Pending Earnings = Status REDEEMED or PAYABLE
        const pendingEarnings = referrals
            .filter(r => [ReferralStatus.REDEEMED, ReferralStatus.PAYABLE].includes(r.status))
            .reduce((sum, r) => sum + Number(r.actualSalonCommission || r.suggestedSalonCommission || 0), 0);

        return {
            totalSalons,
            totalStylists,
            totalEarnings,
            pendingEarnings,
            totalReferrals,
            salons: salons.map(s => ({
                id: s.id,
                name: s.name,
                city: s.city,
                stylistCount: s.stylists?.length || 0,
                level: s.level
            }))
        };
    }

    async getSalonDetails(id: string, owner: User) {
        const salon = await this.salonRepository.findOne({
            where: { id },
            relations: ['stylists', 'owner']
        });

        if (!salon) {
            throw new NotFoundException('Salon not found');
        }

        if (salon.ownerId !== owner.id) {
            throw new ForbiddenException('You do not own this salon');
        }

        // Get Referral Stats for this specific salon
        const referrals = await this.referralRepository.createQueryBuilder('referral')
            .leftJoin('referral.referrer', 'referrer')
            .where('referrer.salonId = :salonId', { salonId: id })
            .getMany();

        const salonEarnings = referrals
            .filter(r => r.status === ReferralStatus.CREDITED)
            .reduce((sum, r) => sum + Number(r.actualSalonCommission || 0), 0);

        return {
            ...salon,
            stats: {
                totalReferrals: referrals.length,
                totalEarnings: salonEarnings,
                pendingEarnings: referrals
                    .filter(r => [ReferralStatus.REDEEMED, ReferralStatus.PAYABLE].includes(r.status))
                    .reduce((sum, r) => sum + Number(r.actualSalonCommission || r.suggestedSalonCommission || 0), 0)
            }
        };
    }

    async addStylist(salonId: string, dto: { name: string; phone: string }, owner: User) {
        const salon = await this.salonRepository.findOne({ where: { id: salonId }, relations: ['owner'] });
        if (!salon) throw new NotFoundException('Salon not found');

        // Ensure the requester is the owner
        // Note: salon.ownerId might be used if available, or compare owner.id with salon.owner.id
        // Since we are using relation now, we should check salon.owner.id
        if (salon.owner?.id !== owner.id) throw new ForbiddenException('Not owner');

        return this.salonsService.addStylistByPhone(salonId, dto.phone, dto.name);
    }

    async removeStylist(salonId: string, stylistId: string, owner: User) {
        const salon = await this.salonRepository.findOne({ where: { id: salonId }, relations: ['owner'] });
        if (!salon) throw new NotFoundException('Salon not found');

        if (salon.owner?.id !== owner.id) throw new ForbiddenException('Not owner');

        return this.salonsService.removeStylistFromSalon(salonId, stylistId);
    }

    async updateProfile(user: User, dto: any) {
        return this.usersService.update(user.id, dto);
    }

    async updateSalon(id: string, dto: any, owner: User) {
        const salon = await this.salonRepository.findOne({ where: { id } });
        if (!salon) throw new NotFoundException('Salon not found');
        if (salon.ownerId !== owner.id) throw new ForbiddenException('Not owner');

        // Only update allowed fields
        Object.assign(salon, dto);
        return this.salonRepository.save(salon);
    }
}
