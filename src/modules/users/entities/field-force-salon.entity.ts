import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Salon } from '../../salons/entities/salon.entity';

@Entity('field_force_salons')
export class FieldForceSalon {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'agent_id' })
    agentId: string;

    @Column({ name: 'salon_id' })
    salonId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'agent_id' })
    agent: User;

    @ManyToOne(() => Salon, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'salon_id' })
    salon: Salon;

    @Column({ default: 'active' })
    status: string; // active, inactive

    @CreateDateColumn({ name: 'assigned_at' })
    assignedAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
