import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscountCode, DiscountType, DiscountStatus } from './entities/discount-code.entity';
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
        private readonly customersService: CustomersService,
        private readonly shopifyService: ShopifyService,
    ) { }

    /**
     * Generate a unique discount code
     */
    private generateCode(prefix: string = 'HO'): string {
        const random = randomBytes(4).toString('hex').toUpperCase();
        return `${prefix}-${random}`;
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
                scope: CustomerScope.GLOBAL, // Creates in both HO-Backend and Shopify
            });

            this.logger.log(`Created customer ${customer.id} with Shopify ID ${customer.shopifyId}`);
        }

        // Ensure customer has Shopify ID for discount targeting
        if (!customer.shopifyId) {
            this.logger.warn(`Customer ${customer.id} has no Shopify ID, discount will apply to all customers`);
        }

        // Generate unique code
        let code = this.generateCode();
        let attempts = 0;
        while (await this.discountRepository.findOne({ where: { code } })) {
            code = this.generateCode();
            attempts++;
            if (attempts > 10) {
                throw new BadRequestException('Failed to generate unique code');
            }
        }

        const startsAt = new Date();
        const expiresAt = new Date(startsAt.getTime() + dto.validityDays * 24 * 60 * 60 * 1000);

        // Create in Shopify first
        let shopifyPriceRuleId: string | undefined;
        let shopifyDiscountCodeId: string | undefined;

        try {
            // Create price rule in Shopify
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
            type: dto.type,
            value: dto.value,
            customerId: customer.id,
            customerPhone: dto.customerPhone,
            shopifyPriceRuleId,
            shopifyDiscountCodeId,
            shopifyProductId: dto.shopifyProductId,
            shopifyVariantId: dto.shopifyVariantId,
            usageLimit: dto.usageLimit || 1,
            usageCount: 0,
            oncePerCustomer: dto.oncePerCustomer ?? true,
            minimumAmount: dto.minimumAmount,
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
}
