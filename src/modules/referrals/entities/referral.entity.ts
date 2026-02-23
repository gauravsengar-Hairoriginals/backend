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
import { User } from '../../users/entities/user.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { DiscountCode } from '../../discounts/entities/discount-code.entity';
import { Order } from '../../orders/entities/order.entity';

export enum ReferralStatus {
    PENDING = 'pending',
    REDEEMED = 'redeemed',
    PAYABLE = 'payable',
    CREDITED = 'credited',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled',
}

@Entity('referrals')
export class Referral {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Referrer (Stylist)
    @Column({ name: 'referrer_id' })
    @Index()
    referrerId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'referrer_id' })
    referrer: User;

    // Referred Customer
    @Column({ name: 'customer_id' })
    @Index()
    customerId: string;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    // Linked Discount Code
    @Column({ name: 'discount_code_id' })
    discountCodeId: string;

    @ManyToOne(() => DiscountCode)
    @JoinColumn({ name: 'discount_code_id' })
    discountCode: DiscountCode;

    // Status
    @Column({
        type: 'enum',
        enum: ReferralStatus,
        default: ReferralStatus.PENDING,
    })
    @Index()
    status: ReferralStatus;

    // Order (when redeemed)
    @Column({ name: 'order_id', nullable: true })
    orderId: string;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'order_id' })
    order: Order;

    // Commission
    @Column({ name: 'order_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    orderAmount: number;

    @Column({ name: 'commission_rate', type: 'decimal', precision: 5, scale: 2, default: 10 })
    commissionRate: number;

    @Column({ name: 'commission_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    commissionAmount: number;

    @Column({ name: 'suggested_commission', type: 'decimal', precision: 10, scale: 2, nullable: true })
    suggestedCommission: number;

    @Column({ name: 'suggested_salon_commission', type: 'decimal', precision: 10, scale: 2, nullable: true })
    suggestedSalonCommission: number;

    @Column({ name: 'actual_salon_commission', type: 'decimal', precision: 10, scale: 2, nullable: true })
    actualSalonCommission: number;

    @Column({ name: 'commission_rule_id', nullable: true })
    commissionRuleId: string;

    @Column({ name: 'credited_at', nullable: true })
    creditedAt: Date;

    // Payment References
    @Column({ name: 'stylist_payment_reference', nullable: true })
    stylistPaymentReference: string;

    @Column({ name: 'salon_payment_reference', nullable: true })
    salonPaymentReference: string;

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
