import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Salon } from './salon.entity';
import { User } from '../../users/entities/user.entity';
import { SalonStage } from '../../../common/enums/salon-stage.enum';

@Entity('salon_photos')
export class SalonPhoto {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'salon_id' })
    salonId: string;

    @ManyToOne(() => Salon, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'salon_id' })
    salon: Salon;

    @Column({
        type: 'enum',
        enum: SalonStage,
    })
    stage: SalonStage;

    @Column({ type: 'text' })
    url: string;

    @Column({ name: 'uploaded_by_id', nullable: true })
    uploadedById: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'uploaded_by_id' })
    uploadedBy: User;

    @Column({ nullable: true })
    caption: string;

    @Column({ name: 'checklist_item', nullable: true })
    checklistItem: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
