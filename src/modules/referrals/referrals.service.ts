import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { CommissionRule, CommissionType } from './entities/commission-rule.entity';
import { CreateReferralDto } from './dto/create-referral.dto';
import { DiscountsService } from '../discounts/discounts.service';
import { DiscountType } from '../discounts/entities/discount-code.entity';
import { User } from '../users/entities/user.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { Level } from '../../common/enums/level.enum';

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
            firstName: dto.firstName,
            lastName: dto.lastName,
            address: dto.customerAddress,
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
                firstName: dto.firstName,
                lastName: dto.lastName,
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
                return rule.value;
            }

            // Check if level-based
            if (rule.allowedLevels?.length && !rule.allowedLevels.includes(stylist.level)) {
                continue;
            }

            // Check if role-based
            if (rule.roleApplicable?.length && rule.roleApplicable.includes(stylist.role)) {
                return rule.value;
            }

            // Default rule (no specific targeting)
            if (!rule.stylistIds?.length && !rule.roleApplicable?.length && !rule.allowedLevels?.length) {
                return rule.value;
            }
        }

        // Default 10% if no rules found
        return 10;
    }

    /**
     * Calculate commission for an order
     */
    /**
     * Calculate commission for a specific role and level
     */
    async calculateRoleCommission(
        orderAmount: number,
        targetRole: UserRole, // STYLIST or SALON_OWNER
        targetLevel: string, // Level of the user
        targetId: string, // User ID (for specific targeting)
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

            // Check specific user targeting (reusing stylistIds field for now, ideally should be userIds)
            if (rule.stylistIds?.length && !rule.stylistIds.includes(targetId)) {
                continue;
            }

            // Check level-based
            if (rule.allowedLevels?.length && !rule.allowedLevels.includes(targetLevel)) {
                continue;
            }

            // Check role - CRITICAL CHANGE here
            // Valid if rule has the target role in its list. 
            // If rule has NO roles defined, it applies to ALL roles (default).
            if (rule.roleApplicable?.length && !rule.roleApplicable.includes(targetRole)) {
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

        // Default: 0 if not found (per user request)
        return { rate: 0, amount: 0 };
    }

    /**
     * Calculate both Stylist and Salon commissions
     */
    async calculateDualCommission(
        orderAmount: number,
        stylist: User,
        productIds: string[] = [],
    ): Promise<{
        stylist: { rate: number; amount: number; ruleId?: string };
        salon: { rate: number; amount: number; ruleId?: string };
    }> {
        // 1. Stylist Commission
        const stylistComm = await this.calculateRoleCommission(
            orderAmount,
            UserRole.STYLIST,
            stylist.level,
            stylist.id,
            productIds
        );

        // 2. Salon Commission (Only if stylist is in a salon)
        let salonComm: { rate: number; amount: number; ruleId?: string } = { rate: 0, amount: 0, ruleId: undefined };

        // Need to fetch salon with owner/manager? 
        // Assuming stylist.salonId is available. 
        // We need the Salon Level and Owner ID? 
        // For now, let's assume Salon Level matches standard levels.
        // Role target is SALON_OWNER.

        // TODO: ideally fetch salon to get its level. 
        // For optimization, if stylist has salon loaded, use it.
        // If not, maybe skip or fetch? 
        // The implementation plan says "Check if Stylist belongs to a Salon".

        if (stylist.salonId) {
            // We need to know the SALON's level. 
            // Ideally `stylist.salon` should be loaded or we fetch it.
            // Loading it here if missing.
            let salonLevel = Level.SILVER; // Default

            // If salon relation is not loaded, we might need to fetch it.
            // But let's assume for now default level or if relations are loaded.
            // Safe fallback:
            if (stylist.salon && stylist.salon.level) {
                salonLevel = stylist.salon.level;
            }

            salonComm = await this.calculateRoleCommission(
                orderAmount,
                UserRole.SALON_OWNER,
                salonLevel,
                '', // No specific salon ID targeting supported in rules yet or use salonId?
                productIds
            );
        }

        return { stylist: stylistComm, salon: salonComm };
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

    async findAllAdmin(params: { status?: string; page?: number; limit?: number; salonPhone?: string; code?: string; stylistPhone?: string }) {
        const { status, page = 1, limit = 20, salonPhone, code, stylistPhone } = params;
        const qb = this.referralRepository.createQueryBuilder('referral')
            .leftJoinAndSelect('referral.customer', 'customer')
            .leftJoinAndSelect('referral.referrer', 'referrer')
            .leftJoinAndSelect('referrer.salon', 'salon')
            .leftJoinAndSelect('referral.discountCode', 'discountCode')
            .leftJoinAndSelect('referral.order', 'order')
            .orderBy('referral.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (status) {
            qb.andWhere('referral.status = :status', { status });
        }

        if (stylistPhone) {
            qb.andWhere('referrer.phone LIKE :stylistPhone', { stylistPhone: `%${stylistPhone}%` });
        }

        if (salonPhone) {
            qb.andWhere('salon.ownerPhone LIKE :phone', { phone: `%${salonPhone}%` });
        }

        if (code) {
            qb.andWhere('discountCode.code LIKE :code', { code: `%${code}%` });
        }

        const [referrals, total] = await qb.getManyAndCount();
        return { referrals, total };
    }

    async updateCommission(id: string, amount: number, salonAmount?: number, status?: ReferralStatus): Promise<Referral> {
        const referral = await this.findById(id);
        referral.commissionAmount = amount;
        if (salonAmount !== undefined) {
            referral.actualSalonCommission = salonAmount;
        }
        if (status) {
            referral.status = status;
        }
        return this.referralRepository.save(referral);
    }

    async bulkCredit(ids: string[], stylistRef?: string, salonRef?: string) {
        if (!ids.length) return { success: false, count: 0 };

        await this.referralRepository
            .createQueryBuilder()
            .update(Referral)
            .set({
                status: ReferralStatus.CREDITED,
                creditedAt: new Date(),
                stylistPaymentReference: stylistRef,
                salonPaymentReference: salonRef
            })
            .whereInIds(ids)
            .andWhere('status IN (:...statuses)', { statuses: [ReferralStatus.REDEEMED, ReferralStatus.PAYABLE] })
            .execute();

        return { success: true, count: ids.length };
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
            relations: ['referrer', 'referrer.salon'], // Load salon
        });

        if (!referral) {
            return null;
        }

        // Calculate commissions
        const { stylist, salon } = await this.calculateDualCommission(
            orderAmount,
            referral.referrer,
        );

        referral.status = ReferralStatus.REDEEMED;
        referral.orderId = orderId;
        referral.orderAmount = orderAmount;

        // Stylist Commission
        referral.commissionAmount = stylist.amount;
        referral.suggestedCommission = stylist.amount;
        if (stylist.ruleId) {
            referral.commissionRuleId = stylist.ruleId;
        }

        // Salon Commission
        referral.suggestedSalonCommission = salon.amount;
        referral.actualSalonCommission = salon.amount; // Default to suggested

        await this.referralRepository.save(referral);
        this.logger.log(`Referral ${referral.id} marked as redeemed. Stylist: ₹${stylist.amount}, Salon: ₹${salon.amount}`);

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

    async findByReferrer(referrerId: string): Promise<Referral[]> {
        return this.referralRepository.find({
            where: { referrerId },
            relations: ['customer', 'discountCode', 'order'],
            order: { createdAt: 'DESC' }
        });
    }

    /**
     * Find referrals by multiple stylist IDs (e.g., all stylists in a salon)
     */
    async findByStylistIds(
        stylistIds: string[],
        query: ReferralsQuery = {},
    ): Promise<{ referrals: Referral[]; total: number }> {
        if (!stylistIds.length) return { referrals: [], total: 0 };

        const { status, page = 1, limit = 50 } = query;

        const qb = this.referralRepository
            .createQueryBuilder('referral')
            .leftJoinAndSelect('referral.customer', 'customer')
            .leftJoinAndSelect('referral.discountCode', 'discountCode')
            .leftJoinAndSelect('referral.order', 'order')
            .leftJoinAndSelect('referral.referrer', 'referrer')
            .where('referral.referrerId IN (:...stylistIds)', { stylistIds });

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
     * Match an order to a pending referral based on customer ID
     * (Fallback if discount code was not used)
     */
    async matchOrderToReferral(
        customer: Customer,
        order: Order,
    ): Promise<Referral | null> {
        // Find pending referral for this customer
        const referral = await this.referralRepository.findOne({
            where: {
                customerId: customer.id,
                status: ReferralStatus.PENDING,
            },
            relations: ['referrer', 'referrer.salon'], // Load salon
            order: { createdAt: 'DESC' }, // Use latest?
        });

        if (!referral) {
            return null;
        }

        this.logger.log(`Found pending referral ${referral.id} for customer ${customer.phone}, matching to order ${order.orderNumber}`);

        // Calculate commissions
        const { stylist, salon } = await this.calculateDualCommission(
            order.subtotal, // Use subtotal (price of goods) or total? Usually subtotal before tax/shipping.
            referral.referrer,
        );

        referral.status = ReferralStatus.REDEEMED;
        referral.orderId = order.id;
        referral.orderAmount = order.total; // Store total for reference

        // Stylist Commission
        referral.commissionAmount = stylist.amount;
        referral.suggestedCommission = stylist.amount;
        if (stylist.ruleId) {
            referral.commissionRuleId = stylist.ruleId;
        }

        // Salon Commission
        referral.suggestedSalonCommission = salon.amount;
        referral.actualSalonCommission = salon.amount; // Default to suggested

        await this.referralRepository.save(referral);
        this.logger.log(`Referral ${referral.id} marked as redeemed via customer match. Stylist: ₹${stylist.amount}, Salon: ₹${salon.amount}`);

        return referral;
    }

    // --- Commission Rules CRUD ---

    async createCommissionRule(dto: CreateCommissionRuleDto): Promise<CommissionRule> {
        const rule = this.commissionRuleRepository.create(dto);
        return this.commissionRuleRepository.save(rule);
    }

    async findAllCommissionRules(): Promise<CommissionRule[]> {
        return this.commissionRuleRepository.find({
            order: { priority: 'DESC', createdAt: 'DESC' },
        });
    }

    async findCommissionRuleById(id: string): Promise<CommissionRule> {
        const rule = await this.commissionRuleRepository.findOne({ where: { id } });
        if (!rule) {
            throw new NotFoundException('Commission rule not found');
        }
        return rule;
    }

    async updateCommissionRule(id: string, dto: Partial<CreateCommissionRuleDto>): Promise<CommissionRule> {
        const rule = await this.findCommissionRuleById(id);
        Object.assign(rule, dto);
        return this.commissionRuleRepository.save(rule);
    }

    async removeCommissionRule(id: string): Promise<void> {
        const rule = await this.findCommissionRuleById(id);
        await this.commissionRuleRepository.remove(rule);
    }
}
