import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscountCode, DiscountType, DiscountStatus } from './entities/discount-code.entity';
import { PricingRule } from './entities/pricing-rule.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { CustomersService } from '../customers/customers.service';
import { CustomerScope } from '../customers/dto/create-customer.dto';
import { ShopifyService } from '../integrations/shopify/shopify.service';
import { randomBytes } from 'crypto';

export interface DiscountsQuery {
    customerPhone?: string;
    status?: DiscountStatus;
    page?: number;
    limit?: number;
}

@Injectable()
export class DiscountsService {
    private readonly logger = new Logger(DiscountsService.name);

    constructor(
        @InjectRepository(DiscountCode)
        private readonly discountRepository: Repository<DiscountCode>,
        @InjectRepository(PricingRule)
        private readonly pricingRuleRepository: Repository<PricingRule>,
        private readonly customersService: CustomersService,
        private readonly shopifyService: ShopifyService,
    ) { }

    async getOrFetchPricingRule(shopifyPriceRuleId: string): Promise<PricingRule> {
        let rule = await this.pricingRuleRepository.findOne({ where: { shopifyPriceRuleId } });

        if (!rule) {
            this.logger.log(`Fetching price rule ${shopifyPriceRuleId} from Shopify...`);
            try {
                const shopifyRule = await this.shopifyService.getPriceRule(shopifyPriceRuleId);

                const newRule = new PricingRule();
                newRule.shopifyPriceRuleId = shopifyRule.id.toString();
                newRule.title = shopifyRule.title;
                newRule.valueType = shopifyRule.value_type;
                newRule.value = Math.abs(parseFloat(shopifyRule.value));
                newRule.minOrderAmount = shopifyRule.prerequisite_subtotal_range ?
                    parseFloat(shopifyRule.prerequisite_subtotal_range.greater_than_or_equal_to) : null;
                newRule.startsAt = new Date(shopifyRule.starts_at);
                newRule.endsAt = shopifyRule.ends_at ? new Date(shopifyRule.ends_at) : null;
                newRule.usageLimit = shopifyRule.usage_limit;

                rule = this.pricingRuleRepository.create(newRule);

                await this.pricingRuleRepository.save(rule);
                this.logger.log(`Cached pricing rule ${shopifyRule.title} locally`);
            } catch (error) {
                this.logger.error(`Failed to fetch/cache pricing rule ${shopifyPriceRuleId}`, error);
                throw error;
            }
        }

        return rule;
    }



    /**
     * Create a discount coupon for a customer
     * If customer doesn't exist, creates them locally and in Shopify first
     */
    async create(dto: CreateDiscountDto): Promise<DiscountCode> {
        // Find or create customer by phone
        let customer = await this.customersService.findByPhone(dto.customerPhone);

        if (!customer) {
            this.logger.log(`Customer not found with phone ${dto.customerPhone}, creating new customer...`);

            // Create customer locally and in Shopify (GLOBAL scope)
            customer = await this.customersService.create({
                phone: dto.customerPhone,
                firstName: dto.firstName,
                lastName: dto.lastName,
                address: dto.address,
                scope: CustomerScope.GLOBAL, // Creates in both HO-Backend and Shopify
            });

            this.logger.log(`Created customer ${customer.id} with Shopify ID ${customer.shopifyId}`);
        }

        // Ensure customer has Shopify ID for discount targeting
        if (!customer.shopifyId) {
            this.logger.warn(`Customer ${customer.id} has no Shopify ID, discount will apply to all customers`);
        }

        // Use customer phone as the code
        const code = dto.customerPhone;

        // Check for duplicate code
        const existingDiscount = await this.discountRepository.findOne({ where: { code } });
        if (existingDiscount) {
            throw new BadRequestException(`Discount code for phone number ${code} already exists`);
        }

        const startsAt = new Date();
        const expiresAt = new Date(startsAt.getTime() + dto.validityDays * 24 * 60 * 60 * 1000);

        // Create in Shopify first
        let shopifyPriceRuleId: string | undefined = this.shopifyService.getConfig('priceRuleId');
        let shopifyDiscountCodeId: string | undefined;
        let pricingRule: PricingRule | null = null;
        let value = dto.value;
        let type = dto.type;

        try {
            if (shopifyPriceRuleId) {
                // Use existing price rule from config and cache it locally
                this.logger.log(`Using existing Shopify Price Rule ID: ${shopifyPriceRuleId}`);
                pricingRule = await this.getOrFetchPricingRule(shopifyPriceRuleId);

                // Override defaults with values from the pricing rule
                value = pricingRule.value;
                type = pricingRule.valueType === 'percentage' ? DiscountType.PERCENTAGE : DiscountType.FIXED_AMOUNT;

            } else {
                // Create new price rule in Shopify
                const priceRule = await this.shopifyService.createPriceRule({
                    title: `Customer Discount - ${customer.phone} - ${code}`,
                    type: dto.type === DiscountType.PERCENTAGE ? 'percentage' : 'fixed_amount',
                    value: dto.value,
                    customerShopifyId: customer.shopifyId || undefined,
                    productId: dto.shopifyProductId,
                    validityDays: dto.validityDays,
                    usageLimit: dto.usageLimit || 1,
                    oncePerCustomer: dto.oncePerCustomer ?? true,
                    minimumAmount: dto.minimumAmount,
                });
                shopifyPriceRuleId = priceRule.id.toString();
            }

            // Create discount code in Shopify
            const discountCode = await this.shopifyService.createDiscountCode(
                shopifyPriceRuleId,
                code,
            );
            shopifyDiscountCodeId = discountCode.id.toString();

            this.logger.log(`Created discount ${code} in Shopify (PriceRule: ${shopifyPriceRuleId})`);
        } catch (error) {
            this.logger.error('Failed to create discount in Shopify:', error);
            throw new BadRequestException('Failed to create discount in Shopify: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }

        // Create local record
        const discount = this.discountRepository.create({
            code,
            type,
            value,
            customerId: customer.id,
            customerPhone: dto.customerPhone,
            shopifyPriceRuleId,
            pricingRuleId: pricingRule?.id,
            shopifyDiscountCodeId,
            shopifyProductId: dto.shopifyProductId,
            shopifyVariantId: dto.shopifyVariantId,
            usageLimit: pricingRule?.usageLimit || dto.usageLimit || 1,
            usageCount: 0,
            oncePerCustomer: dto.oncePerCustomer ?? true,
            minimumAmount: pricingRule?.minOrderAmount || dto.minimumAmount,
            startsAt,
            expiresAt,
            validityDays: dto.validityDays,
            status: DiscountStatus.ACTIVE,
            note: dto.note,
        });

        const saved = await this.discountRepository.save(discount);
        this.logger.log(`Created discount ${code} for customer ${customer.phone}`);

        return this.findById(saved.id);
    }

    async findAll(query: DiscountsQuery = {}): Promise<{ discounts: DiscountCode[]; total: number }> {
        const { customerPhone, status, page = 1, limit = 20 } = query;

        const qb = this.discountRepository
            .createQueryBuilder('discount')
            .leftJoinAndSelect('discount.customer', 'customer');

        if (customerPhone) {
            qb.andWhere('discount.customerPhone = :customerPhone', { customerPhone });
        }

        if (status) {
            qb.andWhere('discount.status = :status', { status });
        }

        qb.orderBy('discount.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        const [discounts, total] = await qb.getManyAndCount();
        return { discounts, total };
    }

    async findById(id: string): Promise<DiscountCode> {
        const discount = await this.discountRepository.findOne({
            where: { id },
            relations: ['customer'],
        });

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return discount;
    }

    async findByCode(code: string): Promise<DiscountCode> {
        const discount = await this.discountRepository.findOne({
            where: { code },
            relations: ['customer'],
        });

        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        return discount;
    }

    async disable(id: string): Promise<DiscountCode> {
        const discount = await this.findById(id);

        if (discount.shopifyPriceRuleId) {
            try {
                await this.shopifyService.deletePriceRule(discount.shopifyPriceRuleId);
            } catch (error) {
                this.logger.warn(`Failed to delete price rule in Shopify: ${error}`);
            }
        }

        discount.status = DiscountStatus.DISABLED;
        await this.discountRepository.save(discount);

        return discount;
    }

    async updateStatus(id: string, status: DiscountStatus): Promise<DiscountCode> {
        const discount = await this.findById(id);

        // If disabling, try to remove from Shopify
        if (status === DiscountStatus.DISABLED && discount.status !== DiscountStatus.DISABLED) {
            if (discount.shopifyPriceRuleId) {
                try {
                    await this.shopifyService.deletePriceRule(discount.shopifyPriceRuleId);
                } catch (error) {
                    this.logger.warn(`Failed to delete price rule in Shopify: ${error}`);
                }
            }
        }

        // If enabling, we might need to recreate in Shopify, but for now just update status locally
        // Re-enabling usually requires creating a new rule in Shopify if it was deleted.
        // For simplicity, we assume this is just a local soft-toggle or the user handles Shopify manually if needed,
        // BUT ideally we should handle Shopify sync. 
        // Given complexity, let's stick to local status update for filtering, as Shopify rules might have been deleted permanently.

        discount.status = status;
        return this.discountRepository.save(discount);
    }
}
