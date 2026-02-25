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
import { User } from '../../users/entities/user.entity';

export enum LeadStatus {
    NEW = 'new',
    CONTACTED = 'contacted',
    CONVERTED_EC = 'converted:Marked to EC',
    CONVERTED_HT = 'converted:Marked to HT',
    CONVERTED_VC = 'converted:Marked to VC',
    DROPPED = 'dropped'
}

export const CALL_STATUS_OPTIONS = [
    'RNR/Disconnect/Busy',
    'Requested callback',
    'Interested (NotSure)',
    'Interested',
    'Wrong Number'
] as const;

export type CallStatus = typeof CALL_STATUS_OPTIONS[number];

export const TIME_SLOT_OPTIONS = [
    '8am–10am',
    '10am–12pm',
    '12pm–2pm',
    '2pm–4pm',
    '4pm–6pm',
    '6pm–8pm',
] as const;
export type TimeSlot = typeof TIME_SLOT_OPTIONS[number];

@Entity('lead_records')
export class LeadRecord {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ── Core relations ──────────────────────────────────────────────────
    @ManyToOne(() => Customer, { onDelete: 'CASCADE', eager: true })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Index()
    @Column({ name: 'customer_id' })
    customerId: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'assigned_to_id' })
    assignedTo: User;

    @Index()
    @Column({ name: 'assigned_to_id', nullable: true })
    assignedToId: string;

    @Column({ name: 'assigned_to_name', nullable: true })
    assignedToName: string;

    // ── Campaign / Source ───────────────────────────────────────────────
    @Index()
    @Column({ nullable: true })
    source: string;

    @Column({ name: 'page_type', nullable: true })
    pageType: string;

    @Index()
    @Column({ name: 'campaign_id', nullable: true })
    campaignId: string;

    @Column({ name: 'specific_details', type: 'jsonb', nullable: true })
    specificDetails: Record<string, any>;

    // ── Lead Status ─────────────────────────────────────────────────────
    @Index()
    @Column({ type: 'varchar', default: LeadStatus.NEW })
    status: LeadStatus;

    @Column({ name: 'converted_at', type: 'timestamp', nullable: true })
    convertedAt: Date;

    // True if this customer had a prior lead record when this lead was created
    @Column({ name: 'is_revisit', type: 'boolean', default: false })
    isRevisit: boolean;

    // ── Call Attempts ───────────────────────────────────────────────────
    @Index()
    @Column({ name: 'call1', nullable: true })
    call1: string;

    @Index()
    @Column({ name: 'call2', nullable: true })
    call2: string;

    @Column({ name: 'call3', nullable: true })
    call3: string;

    // ── Appointment ─────────────────────────────────────────────────────
    @Column({ name: 'appointment_booked', type: 'boolean', nullable: true })
    appointmentBooked: boolean;

    @Column({ name: 'booked_date', type: 'date', nullable: true })
    bookedDate: string;

    // ── Notes ───────────────────────────────────────────────────────────
    @Column({ type: 'text', nullable: true })
    remarks: string;

    // ── Lead Preferences ────────────────────────────────────────────────
    @Column({ name: 'preferred_experience_center', nullable: true })
    preferredExperienceCenter: string;

    @Column({ name: 'next_action_date', type: 'timestamp', nullable: true })
    nextActionDate: string;

    @Column({ name: 'preferred_products', type: 'simple-array', nullable: true })
    preferredProducts: string[];

    // { [productTitle]: { [optionName]: selectedValue } }
    @Column({ name: 'preferred_product_options', type: 'jsonb', nullable: true })
    preferredProductOptions: Record<string, Record<string, string>>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
