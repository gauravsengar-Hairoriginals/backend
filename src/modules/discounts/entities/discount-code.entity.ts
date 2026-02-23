import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { PricingRule } from './pricing-rule.entity';

export enum DiscountType {
    PERCENTAGE = 'percentage',
    FIXED_AMOUNT = 'fixed_amount',
}

export enum DiscountStatus {
    ACTIVE = 'active',
    EXPIRED = 'expired',
    USED = 'used',
    DISABLED = 'disabled',
}

@Entity('discount_codes')
export class DiscountCode {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Shopify References
    @Column({ name: 'shopify_price_rule_id', nullable: true })
    shopifyPriceRuleId: string;

    @Column({ name: 'pricing_rule_id', nullable: true })
    pricingRuleId: string;

    @ManyToOne(() => PricingRule, { nullable: true })
    @JoinColumn({ name: 'pricing_rule_id' })
    pricingRule: PricingRule;

    @Column({ name: 'shopify_discount_code_id', nullable: true })
    shopifyDiscountCodeId: string;

    // Code
    @Column({ unique: true })
    @Index()
    code: string;

    // Type and Value
    @Column({
        type: 'enum',
        enum: DiscountType,
        default: DiscountType.PERCENTAGE,
    })
    type: DiscountType;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    value: number;

    // Customer targeting (optional)
    @Column({ name: 'customer_id', nullable: true })
    customerId: string;

    @ManyToOne(() => Customer, { nullable: true })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'customer_phone', nullable: true })
    @Index()
    customerPhone: string;

    // Product targeting (optional)
    @Column({ name: 'product_id', nullable: true })
    productId: string;

    @Column({ name: 'shopify_product_id', nullable: true })
    shopifyProductId: string;

    @Column({ name: 'variant_id', nullable: true })
    variantId: string;

    @Column({ name: 'shopify_variant_id', nullable: true })
    shopifyVariantId: string;

    // Usage limits
    @Column({ name: 'usage_limit', nullable: true })
    usageLimit: number;

    @Column({ name: 'usage_count', default: 0 })
    usageCount: number;

    @Column({ name: 'once_per_customer', default: true })
    oncePerCustomer: boolean;

    // Minimum requirements
    @Column({ name: 'minimum_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    minimumAmount: number;

    @Column({ name: 'minimum_quantity', nullable: true })
    minimumQuantity: number;

    // Validity
    @Column({ name: 'starts_at' })
    startsAt: Date;

    @Column({ name: 'expires_at', nullable: true })
    expiresAt: Date;

    @Column({ name: 'validity_days', nullable: true })
    validityDays: number;

    // Status
    @Column({
        type: 'enum',
        enum: DiscountStatus,
        default: DiscountStatus.ACTIVE,
    })
    @Index()
    status: DiscountStatus;

    // Notes
    @Column({ type: 'text', nullable: true })
    note: string;

    // Metadata
    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
