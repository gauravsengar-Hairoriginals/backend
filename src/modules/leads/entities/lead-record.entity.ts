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
    FOLLOW_UP = 'follow_up',
    CONVERTED = 'converted',
    NOT_INTERESTED = 'not_interested',
}

export const CALL_STATUS_OPTIONS = [
    'RNR',              // No response
    'Disconnect',
    'Requested callback',
    'Not Interested',
    'Interested',
    'Not reachable',
    'Busy',
    'Switch off',
] as const;
export type CallStatus = typeof CALL_STATUS_OPTIONS[number];

export const TIME_SLOT_OPTIONS = [
    'Morning 10am–1pm',
    'Afternoon 1pm–4pm',
    'Evening 4pm–7pm',
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

    // ── Scheduling ──────────────────────────────────────────────────────
    @Column({ type: 'boolean', nullable: true })
    scheduled: boolean;

    @Column({ name: 'selected_date', type: 'date', nullable: true })
    selectedDate: string;

    @Column({ name: 'time_slot', nullable: true })
    timeSlot: string;

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

    @Column({ name: 'next_action_date', type: 'date', nullable: true })
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
