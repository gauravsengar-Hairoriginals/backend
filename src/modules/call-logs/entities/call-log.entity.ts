import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { LeadRecord } from '../../leads/entities/lead-record.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';

export enum CallLogStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    MISSED = 'missed',
}

@Entity('call_logs')
export class CallLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ── Relations ─────────────────────────────────────────────────────────────
    @ManyToOne(() => LeadRecord, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'lead_id' })
    lead: LeadRecord;

    @Column({ name: 'lead_id', nullable: true })
    leadId: string;

    @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'customer_id', nullable: true })
    customerId: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'agent_id' })
    agent: User;

    @Column({ name: 'agent_id', nullable: true })
    agentId: string;

    // ── Dial details (set at initiation) ──────────────────────────────────────
    @Column({ name: 'agent_number', nullable: true })
    agentNumber: string;

    @Column({ name: 'caller_number', nullable: true })
    callerNumber: string;

    @Column({ type: 'enum', enum: CallLogStatus, default: CallLogStatus.PENDING })
    status: CallLogStatus;

    // ── qkonnect callback fields ───────────────────────────────────────────────
    @Column({ name: 'call_id', nullable: true })
    callId: string;

    @Column({ name: 'destination_number', nullable: true })
    destinationNumber: string;

    @Column({ name: 'last_key_pressed', nullable: true })
    lastKeyPressed: string;

    @Column({ name: 'dtmf_details', type: 'text', nullable: true })
    dtmfDetails: string;

    @Column({ name: 'call_start_time', type: 'timestamp', nullable: true })
    callStartTime: Date;

    @Column({ name: 'call_end_time', type: 'timestamp', nullable: true })
    callEndTime: Date;

    @Column({ name: 'call_pickup_time', type: 'timestamp', nullable: true })
    callPickupTime: Date;

    @Column({ name: 'call_hangup_time', type: 'timestamp', nullable: true })
    callHangupTime: Date;

    @Column({ name: 'total_call_duration', type: 'int', nullable: true })
    totalCallDuration: number;

    @Column({ name: 'ivr_duration', type: 'int', nullable: true })
    ivrDuration: number;

    @Column({ name: 'call_transfer_duration', type: 'int', nullable: true })
    callTransferDuration: number;

    @Column({ name: 'call_action', nullable: true })
    callAction: string;

    @Column({ name: 'call_recording_url', type: 'text', nullable: true })
    callRecordingUrl: string;

    @Column({ name: 'call_conference_uid', nullable: true })
    callConferenceUid: string;

    // ── Timestamps ────────────────────────────────────────────────────────────
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
