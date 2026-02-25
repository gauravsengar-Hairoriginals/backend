import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { LeadRecord } from './lead-record.entity';
import { User } from '../../users/entities/user.entity';

@Entity('lead_history')
export class LeadHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ name: 'lead_record_id' })
    leadRecordId: string;

    @ManyToOne(() => LeadRecord, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lead_record_id' })
    leadRecord: LeadRecord;

    // Who made the change
    @Column({ name: 'changed_by_id', nullable: true })
    changedById: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'changed_by_id' })
    changedBy: User;

    @Column({ name: 'changed_by_name', nullable: true })
    changedByName: string;

    @Column({ name: 'changed_by_email', nullable: true })
    changedByEmail: string;

    // What changed
    @Column({ name: 'field_name' })
    fieldName: string;

    @Column({ name: 'old_value', type: 'text', nullable: true })
    oldValue: string;

    @Column({ name: 'new_value', type: 'text', nullable: true })
    newValue: string;

    @CreateDateColumn({ name: 'changed_at' })
    changedAt: Date;
}
