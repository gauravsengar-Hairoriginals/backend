import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    OneToOne,
    Unique,
} from 'typeorm';
import { CustomerProfile } from './customer-profile.entity';

export enum CustomerGender {
    MALE = 'male',
    FEMALE = 'female',
    OTHER = 'other',
}

export enum CustomerType {
    NEW = 'new',
    RETURNING = 'returning',
    VIP = 'vip',
    CHURNED = 'churned',
}

export enum ContactMethod {
    WHATSAPP = 'whatsapp',
    CALL = 'call',
    EMAIL = 'email',
    SMS = 'sms',
}

@Entity('customers')
@Unique('UQ_customer_phone_email', ['phone', 'email']) // Same phone+email = same customer
export class Customer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // External System IDs
    @Column({ name: 'shopify_id', nullable: true, unique: true })
    @Index()
    shopifyId: string;

    @Column({ name: 'leadsquared_id', nullable: true })
    leadsquaredId: string;

    @Column({ name: 'quickreply_id', nullable: true })
    quickreplyId: string;

    // Basic Info
    @Column()
    @Index()
    phone: string;

    @Column({ nullable: true })
    @Index()
    email: string;

    @Column({ nullable: true })
    name: string;

    @Column({ name: 'first_name', nullable: true })
    firstName: string;

    @Column({ name: 'last_name', nullable: true })
    lastName: string;

    @Column({
        type: 'enum',
        enum: CustomerGender,
        nullable: true,
    })
    gender: CustomerGender;

    @Column({ name: 'date_of_birth', type: 'date', nullable: true })
    dateOfBirth: Date;

    // Address & Location
    @Column({ name: 'address_line1', nullable: true })
    addressLine1: string;

    @Column({ name: 'address_line2', nullable: true })
    addressLine2: string;

    @Column({ nullable: true })
    @Index()
    city: string;

    @Column({ nullable: true })
    state: string;

    @Column({ nullable: true })
    pincode: string;

    @Column({ default: 'India' })
    country: string;

    @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
    latitude: number;

    @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
    longitude: number;

    // Customer Status
    @Column({
        name: 'customer_type',
        type: 'enum',
        enum: CustomerType,
        default: CustomerType.NEW,
    })
    customerType: CustomerType;

    @Column({ name: 'is_verified', default: false })
    isVerified: boolean;

    @Column({ name: 'accepts_marketing', default: false })
    acceptsMarketing: boolean;

    // Activity Tracking
    @Column({ name: 'first_seen_at', nullable: true })
    firstSeenAt: Date;

    @Column({ name: 'last_activity_at', nullable: true })
    @Index()
    lastActivityAt: Date;

    @Column({ name: 'last_activity_platform', nullable: true })
    lastActivityPlatform: string;

    @Column({ name: 'last_activity_type', nullable: true })
    lastActivityType: string;

    // Order Summary (denormalized for quick access)
    @Column({ name: 'total_orders', default: 0 })
    totalOrders: number;

    @Column({ name: 'total_spent', type: 'decimal', precision: 10, scale: 2, default: 0 })
    totalSpent: number;

    @Column({ name: 'average_order_value', type: 'decimal', precision: 10, scale: 2, default: 0 })
    averageOrderValue: number;

    @Column({ name: 'last_order_at', nullable: true })
    lastOrderAt: Date;

    // Preferences
    @Column({
        name: 'preferred_contact_method',
        type: 'enum',
        enum: ContactMethod,
        default: ContactMethod.WHATSAPP,
    })
    preferredContactMethod: ContactMethod;

    @Column({ name: 'preferred_language', default: 'en' })
    preferredLanguage: string;

    // Tags from Shopify
    @Column('simple-array', { nullable: true })
    tags: string[];

    // Notes
    @Column({ type: 'text', nullable: true })
    notes: string;

    // Custom metadata
    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    // ============================================
    // Linked Profiles for Deduplication Tracking
    // ============================================

    // Customer IDs with same email (but different phone)
    @Column({ name: 'linked_by_email', type: 'jsonb', nullable: true, default: [] })
    linkedByEmail: string[];

    // Customer IDs with same phone (but different email)
    @Column({ name: 'linked_by_phone', type: 'jsonb', nullable: true, default: [] })
    linkedByPhone: string[];

    // Profile relation
    @OneToOne(() => CustomerProfile, (profile) => profile.customer, { eager: true })
    profile: CustomerProfile;

    // Sync tracking
    @Column({ name: 'synced_at', nullable: true })
    syncedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

