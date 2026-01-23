import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';

export enum OrderSyncStatus {
    PENDING_SYNC = 'pending_sync',
    SYNCED = 'synced',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
}

export enum FinancialStatus {
    PENDING = 'pending',
    AUTHORIZED = 'authorized',
    PARTIALLY_PAID = 'partially_paid',
    PAID = 'paid',
    PARTIALLY_REFUNDED = 'partially_refunded',
    REFUNDED = 'refunded',
    VOIDED = 'voided',
}

export enum FulfillmentStatus {
    UNFULFILLED = 'unfulfilled',
    PARTIAL = 'partial',
    FULFILLED = 'fulfilled',
}

export interface OrderAddress {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    phone?: string;
}

export interface DiscountCode {
    code: string;
    amount: string;
    type: 'percentage' | 'fixed_amount';
}

export interface DiscountApplication {
    type: string;
    value: string;
    valueType: 'percentage' | 'fixed_amount';
    allocationMethod: string;
    targetSelection: string;
    title: string;
    description?: string;
}

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Shopify Reference
    @Column({ name: 'shopify_id', nullable: true, unique: true })
    @Index()
    shopifyId: string;

    @Column({ name: 'order_number', nullable: true })
    @Index()
    orderNumber: string;

    // Customer Reference
    @Column({ name: 'customer_id', nullable: true })
    customerId: string;

    @ManyToOne(() => Customer, { nullable: true })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    // Sync Status
    @Column({
        name: 'sync_status',
        type: 'enum',
        enum: OrderSyncStatus,
        default: OrderSyncStatus.PENDING_SYNC,
    })
    @Index()
    syncStatus: OrderSyncStatus;

    @Column({ name: 'sync_error', type: 'text', nullable: true })
    syncError: string;

    @Column({ name: 'synced_at', nullable: true })
    syncedAt: Date;

    // Order Status
    @Column({
        name: 'financial_status',
        type: 'enum',
        enum: FinancialStatus,
        default: FinancialStatus.PENDING,
    })
    financialStatus: FinancialStatus;

    @Column({
        name: 'fulfillment_status',
        type: 'enum',
        enum: FulfillmentStatus,
        default: FulfillmentStatus.UNFULFILLED,
    })
    fulfillmentStatus: FulfillmentStatus;

    // Pricing
    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    subtotal: number;

    @Column({ name: 'discount_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
    discountTotal: number;

    @Column({ name: 'tax_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
    taxTotal: number;

    @Column({ name: 'shipping_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
    shippingTotal: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total: number;

    @Column({ default: 'INR' })
    currency: string;

    // Discounts
    @Column({ name: 'discount_codes', type: 'jsonb', nullable: true })
    discountCodes: DiscountCode[];

    @Column({ name: 'discount_applications', type: 'jsonb', nullable: true })
    discountApplications: DiscountApplication[];

    // Addresses
    @Column({ name: 'shipping_address', type: 'jsonb', nullable: true })
    shippingAddress: OrderAddress;

    @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
    billingAddress: OrderAddress;

    // Fulfillment Details
    @Column({ name: 'tracking_number', nullable: true })
    trackingNumber: string;

    @Column({ name: 'tracking_url', nullable: true })
    trackingUrl: string;

    @Column({ nullable: true })
    carrier: string;

    @Column({ name: 'fulfilled_at', nullable: true })
    fulfilledAt: Date;

    // Cancellation
    @Column({ name: 'cancel_reason', nullable: true })
    cancelReason: string;

    @Column({ name: 'cancelled_at', nullable: true })
    cancelledAt: Date;

    // Notes
    @Column({ type: 'text', nullable: true })
    note: string;

    // Tags
    @Column('simple-array', { nullable: true })
    tags: string[];

    // Source tracking
    @Column({ nullable: true })
    source: string;

    // Metadata
    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    // Line Items relation
    @OneToMany(() => OrderLineItem, (lineItem) => lineItem.order, { cascade: true })
    lineItems: OrderLineItem[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

@Entity('order_line_items')
export class OrderLineItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'order_id' })
    orderId: string;

    @ManyToOne(() => Order, (order) => order.lineItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'order_id' })
    order: Order;

    // Shopify References
    @Column({ name: 'shopify_line_item_id', nullable: true })
    shopifyLineItemId: string;

    @Column({ name: 'shopify_product_id', nullable: true })
    shopifyProductId: string;

    @Column({ name: 'shopify_variant_id', nullable: true })
    shopifyVariantId: string;

    // Local References
    @Column({ name: 'product_id', nullable: true })
    productId: string;

    @Column({ name: 'variant_id', nullable: true })
    variantId: string;

    // Product Info
    @Column()
    title: string;

    @Column({ name: 'variant_title', nullable: true })
    variantTitle: string;

    @Column({ nullable: true })
    sku: string;

    @Column({ default: 1 })
    quantity: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    price: number;

    @Column({ name: 'total_discount', type: 'decimal', precision: 10, scale: 2, default: 0 })
    totalDiscount: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    total: number;

    // Properties (customizations)
    @Column({ type: 'jsonb', nullable: true })
    properties: Record<string, string>[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
