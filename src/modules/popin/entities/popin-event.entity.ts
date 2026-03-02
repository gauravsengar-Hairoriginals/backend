import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { LeadRecord } from '../../leads/entities/lead-record.entity';

@Entity('popin_events')
export class PopinEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    event: string;

    @Column({ name: 'popin_user_id', nullable: true })
    popinUserId: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    email: string;

    @Column({ name: 'raw_payload', type: 'jsonb' })
    rawPayload: Record<string, any>;

    @Column({ default: false })
    processed: boolean;

    @Column({ name: 'lead_record_id', nullable: true })
    leadRecordId: string;

    @ManyToOne(() => LeadRecord, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'lead_record_id' })
    leadRecord: LeadRecord;

    @Index({ unique: true })
    @Column({ name: 'dedup_key', unique: true })
    dedupKey: string;

    @Column({ name: 'processing_error', nullable: true })
    processingError: string;

    @CreateDateColumn({ name: 'received_at' })
    receivedAt: Date;
}
