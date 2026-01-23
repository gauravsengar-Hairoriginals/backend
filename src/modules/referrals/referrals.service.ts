import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { CommissionRule, CommissionType } from './entities/commission-rule.entity';
import { CreateReferralDto } from './dto/create-referral.dto';
import { DiscountsService } from '../discounts/discounts.service';
import { DiscountType } from '../discounts/entities/discount-code.entity';
import { User } from '../users/entities/user.entity';

export interface ReferralsQuery {
    status?: ReferralStatus;
    page?: number;
    limit?: number;
}

export interface ReferralStats {
    totalReferrals: number;
    pendingReferrals: number;
    redeemedReferrals: number;
    expiredReferrals: number;
    totalEarnings: number;
    pendingCredits: number;
    thisMonthReferrals: number;
    thisMonthEarnings: number;
}

@Injectable()
export class ReferralsService {
    private readonly logger = new Logger(ReferralsService.name);

    constructor(
        @InjectRepository(Referral)
        private readonly referralRepository: Repository<Referral>,
        @InjectRepository(CommissionRule)
        private readonly commissionRuleRepository: Repository<CommissionRule>,
        private readonly discountsService: DiscountsService,
    ) { }

    /**
     * Create a referral - generates discount code and links to stylist
     */
    async create(dto: CreateReferralDto, referrer: User): Promise<Referral> {
        // Get commission rate for this stylist
        const commissionRate = await this.getCommissionRate(referrer);

        // Create discount using existing service
        const discount = await this.discountsService.create({
            customerPhone: dto.customerPhone,
            type: dto.discountType || DiscountType.PERCENTAGE,
            value: dto.discountValue || 20,
            validityDays: dto.validityDays || 30,
            shopifyProductId: dto.shopifyProductId,
            note: dto.note,
        });

        // Create referral record
        const referral = this.referralRepository.create({
            referrerId: referrer.id,
            customerId: discount.customerId,
            discountCodeId: discount.id,
            status: ReferralStatus.PENDING,
            commissionRate,
            note: dto.note,
            metadata: {
                customerName: dto.customerName,
                customerAddress: dto.customerAddress,
            },
        });

        const saved = await this.referralRepository.save(referral);
        this.logger.log(`Created referral ${saved.id} by ${referrer.phone} for ${dto.customerPhone}`);

        return this.findById(saved.id);
    }

    /**
     * Get commission rate for a stylist based on rules
     */
    private async getCommissionRate(stylist: User): Promise<number> {
        const now = new Date();

        // Find applicable rules ordered by priority
        const rules = await this.commissionRuleRepository.find({
            where: { isActive: true },
            order: { priority: 'DESC' },
        });

        for (const rule of rules) {
            // Check validity dates
            if (rule.validFrom && rule.validFrom > now) continue;
            if (rule.validUntil && rule.validUntil < now) continue;

            // Check if stylist-specific
            if (rule.stylistIds?.length && rule.stylistIds.includes(stylist.id)) {
                return rule.type === CommissionType.PERCENTAGE ? rule.value : rule.value;
            }

            // Check if role-based
            if (rule.roleApplicable?.length && rule.roleApplicable.includes(stylist.role)) {
                return rule.value;
            }

            // Default rule (no specific targeting)
            if (!rule.stylistIds?.length && !rule.roleApplicable?.length) {
                return rule.value;
            }
        }

        // Default 10% if no rules found
        return 10;
    }

    /**
     * Calculate commission for an order
     */
    async calculateCommission(
        orderAmount: number,
        stylist: User,
        productIds: string[] = [],
    ): Promise<{ rate: number; amount: number; ruleId?: string }> {
        const now = new Date();
        const rules = await this.commissionRuleRepository.find({
            where: { isActive: true },
            order: { priority: 'DESC' },
        });

        for (const rule of rules) {
            // Check validity
            if (rule.validFrom && rule.validFrom > now) continue;
            if (rule.validUntil && rule.validUntil < now) continue;

            // Check minimum order
            if (orderAmount < rule.minOrderAmount) continue;

            // Check product-specific
            if (rule.productIds?.length) {
                const hasProduct = productIds.some((id) => rule.productIds.includes(id));
                if (!hasProduct) continue;
            }

            // Check stylist-specific
            if (rule.stylistIds?.length && !rule.stylistIds.includes(stylist.id)) {
                continue;
            }

            // Check role
            if (rule.roleApplicable?.length && !rule.roleApplicable.includes(stylist.role)) {
                continue;
            }

            // Calculate commission
            let amount: number;
            let rate = rule.value;

            if (rule.type === CommissionType.PERCENTAGE) {
                amount = orderAmount * (rule.value / 100);
            } else if (rule.type === CommissionType.FIXED) {
                amount = rule.value;
            } else if (rule.type === CommissionType.TIERED && rule.tiers) {
                const tier = rule.tiers.find(
                    (t) => orderAmount >= t.minAmount && (t.maxAmount === null || orderAmount <= t.maxAmount),
                );
                if (tier) {
                    rate = tier.rate;
                    amount = orderAmount * (tier.rate / 100);
                } else {
                    continue;
                }
            } else {
                continue;
            }

            // Apply cap
            if (rule.maxCommission && amount > rule.maxCommission) {
                amount = rule.maxCommission;
            }

            return { rate, amount, ruleId: rule.id };
        }

        // Default 10%
        const amount = orderAmount * 0.10;
        return { rate: 10, amount };
    }

    /**
     * Get referrals for a stylist (dashboard)
     */
    async findMyReferrals(
        referrerId: string,
        query: ReferralsQuery = {},
    ): Promise<{ referrals: Referral[]; total: number }> {
        const { status, page = 1, limit = 20 } = query;

        const qb = this.referralRepository
            .createQueryBuilder('referral')
            .leftJoinAndSelect('referral.customer', 'customer')
            .leftJoinAndSelect('referral.discountCode', 'discountCode')
            .leftJoinAndSelect('referral.order', 'order')
            .where('referral.referrerId = :referrerId', { referrerId });

        if (status) {
            qb.andWhere('referral.status = :status', { status });
        }

        qb.orderBy('referral.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [referrals, total] = await qb.getManyAndCount();
        return { referrals, total };
    }

    /**
     * Get dashboard stats for a stylist
     */
    async getMyStats(referrerId: string): Promise<ReferralStats> {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Total counts
        const [
            totalReferrals,
            pendingReferrals,
            redeemedReferrals,
            expiredReferrals,
        ] = await Promise.all([
            this.referralRepository.count({ where: { referrerId } }),
            this.referralRepository.count({ where: { referrerId, status: ReferralStatus.PENDING } }),
            this.referralRepository.count({ where: { referrerId, status: ReferralStatus.REDEEMED } }),
            this.referralRepository.count({ where: { referrerId, status: ReferralStatus.EXPIRED } }),
        ]);

        // Earnings
        const earningsQuery = await this.referralRepository
            .createQueryBuilder('referral')
            .select('SUM(referral.commissionAmount)', 'total')
            .where('referral.referrerId = :referrerId', { referrerId })
            .andWhere('referral.status = :status', { status: ReferralStatus.CREDITED })
            .getRawOne();
        const totalEarnings = parseFloat(earningsQuery?.total) || 0;

        // Pending credits
        const pendingQuery = await this.referralRepository
            .createQueryBuilder('referral')
            .select('SUM(referral.commissionAmount)', 'total')
            .where('referral.referrerId = :referrerId', { referrerId })
            .andWhere('referral.status = :status', { status: ReferralStatus.REDEEMED })
            .getRawOne();
        const pendingCredits = parseFloat(pendingQuery?.total) || 0;

        // This month
        const thisMonthReferrals = await this.referralRepository.count({
            where: {
                referrerId,
                createdAt: MoreThanOrEqual(startOfMonth),
            },
        });

        const thisMonthEarningsQuery = await this.referralRepository
            .createQueryBuilder('referral')
            .select('SUM(referral.commissionAmount)', 'total')
            .where('referral.referrerId = :referrerId', { referrerId })
            .andWhere('referral.status = :status', { status: ReferralStatus.CREDITED })
            .andWhere('referral.creditedAt >= :startOfMonth', { startOfMonth })
            .getRawOne();
        const thisMonthEarnings = parseFloat(thisMonthEarningsQuery?.total) || 0;

        return {
            totalReferrals,
            pendingReferrals,
            redeemedReferrals,
            expiredReferrals,
            totalEarnings,
            pendingCredits,
            thisMonthReferrals,
            thisMonthEarnings,
        };
    }

    async findById(id: string): Promise<Referral> {
        const referral = await this.referralRepository.findOne({
            where: { id },
            relations: ['customer', 'discountCode', 'order', 'referrer'],
        });

        if (!referral) {
            throw new NotFoundException('Referral not found');
        }

        return referral;
    }

    /**
     * Mark referral as redeemed when order is placed
     */
    async markRedeemed(
        discountCodeId: string,
        orderId: string,
        orderAmount: number,
    ): Promise<Referral | null> {
        const referral = await this.referralRepository.findOne({
            where: { discountCodeId, status: ReferralStatus.PENDING },
            relations: ['referrer'],
        });

        if (!referral) {
            return null;
        }

        // Calculate commission
        const { amount, ruleId } = await this.calculateCommission(
            orderAmount,
            referral.referrer,
        );

        referral.status = ReferralStatus.REDEEMED;
        referral.orderId = orderId;
        referral.orderAmount = orderAmount;
        referral.commissionAmount = amount;
        if (ruleId) {
            referral.commissionRuleId = ruleId;
        }

        await this.referralRepository.save(referral);
        this.logger.log(`Referral ${referral.id} marked as redeemed, commission: ₹${amount}`);

        return referral;
    }

    /**
     * Mark referral as credited (after payout)
     */
    async markCredited(id: string): Promise<Referral> {
        const referral = await this.findById(id);
        referral.status = ReferralStatus.CREDITED;
        referral.creditedAt = new Date();
        return this.referralRepository.save(referral);
    }
}
