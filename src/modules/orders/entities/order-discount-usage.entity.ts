import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { DiscountCode } from '../../discounts/entities/discount-code.entity';

export enum DiscountUsageType {
    DISCOUNT_CODE = 'discount_code',
    STORE_CREDIT = 'store_credit',
    AUTOMATIC = 'automatic',
    SCRIPT = 'script',
    MANUAL = 'manual',
}

export enum DiscountValueType {
    PERCENTAGE = 'percentage',
    FIXED_AMOUNT = 'fixed_amount',
    FIXED_AMOUNT_PER_ITEM = 'fixed_amount_per_item',
}

export enum DiscountTargetType {
    LINE_ITEM = 'line_item',
    SHIPPING = 'shipping',
    ORDER = 'order',
}

export enum DiscountTargetSelection {
    ALL = 'all',
    ENTITLED = 'entitled',
    EXPLICIT = 'explicit',
}

export enum DiscountAllocationMethod {
    ACROSS = 'across',
    EACH = 'each',
    ONE = 'one',
}

/**
 * Tracks each discount application on an order
 * Provides detailed analytics on discount usage
 */
@Entity('order_discount_usages')
export class OrderDiscountUsage {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Order Reference
    @Column({ name: 'order_id' })
    @Index()
    orderId: string;

    @ManyToOne(() => Order, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'order_id' })
    order: Order;

    // Local Discount Code Reference (nullable - for codes created in HO system)
    @Column({ name: 'discount_code_id', nullable: true })
    @Index()
    discountCodeId: string;

    @ManyToOne(() => DiscountCode, { nullable: true })
    @JoinColumn({ name: 'discount_code_id' })
    discountCode: DiscountCode;

    // Shopify Reference
    @Column({ name: 'shopify_discount_code_id', nullable: true })
    shopifyDiscountCodeId: string;

    // The actual code used
    @Column({ nullable: true })
    code: string;

    // Discount Type
    @Column({
        type: 'enum',
        enum: DiscountUsageType,
        default: DiscountUsageType.DISCOUNT_CODE,
    })
    type: DiscountUsageType;

    // Value Configuration
    @Column({
        name: 'value_type',
        type: 'enum',
        enum: DiscountValueType,
        default: DiscountValueType.FIXED_AMOUNT,
    })
    valueType: DiscountValueType;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    value: number;

    // Actual amount saved on this order
    @Column({ name: 'amount_saved', type: 'decimal', precision: 10, scale: 2, default: 0 })
    amountSaved: number;

    // Target Configuration
    @Column({
        name: 'target_type',
        type: 'enum',
        enum: DiscountTargetType,
        default: DiscountTargetType.LINE_ITEM,
    })
    targetType: DiscountTargetType;

    @Column({
        name: 'target_selection',
        type: 'enum',
        enum: DiscountTargetSelection,
        default: DiscountTargetSelection.ALL,
    })
    targetSelection: DiscountTargetSelection;

    @Column({
        name: 'allocation_method',
        type: 'enum',
        enum: DiscountAllocationMethod,
        default: DiscountAllocationMethod.ACROSS,
    })
    allocationMethod: DiscountAllocationMethod;

    // Human-readable title
    @Column({ nullable: true })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    // Metadata
    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
