import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Level } from '../../../common/enums/level.enum';
import { SalonStage } from '../../../common/enums/salon-stage.enum';
import { FieldForceSalon } from '../../users/entities/field-force-salon.entity';

@Entity('salons')
export class Salon {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;



    @Column({ name: 'manager_name', nullable: true })
    managerName: string;

    @Column({ name: 'manager_phone', nullable: true })
    managerPhone: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true })
    state: string;

    @Column({ nullable: true })
    pincode: string;

    // GPS Location
    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    latitude: number;

    @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
    longitude: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({
        type: 'enum',
        enum: Level,
        default: Level.SILVER
    })
    level: Level;

    // Salon Lifecycle Stage
    @Column({
        type: 'enum',
        enum: SalonStage,
        default: SalonStage.APPROACH,
    })
    stage: SalonStage;

    // Checklist: { "address_filled": true, "owner_details_filled": false, ... }
    @Column({ type: 'jsonb', default: {} })
    checklist: Record<string, boolean>;

    @Column({ name: 'stage_updated_at', nullable: true })
    stageUpdatedAt: Date;

    // Owner Relationship (Multi-Salon Support)
    @Column({ name: 'owner_id', nullable: true })
    ownerId: string;

    @ManyToOne(() => User, (user) => user.ownedSalons)
    @JoinColumn({ name: 'owner_id' })
    owner: User;

    // One salon has many stylists
    @OneToMany(() => User, (user) => user.salon)
    stylists: User[];

    @OneToMany(() => FieldForceSalon, (ffs) => ffs.salon)
    fieldForceSalons: FieldForceSalon[];

    @Column({ name: 'total_staff', nullable: true })
    totalStaff: number;

    @Column({ name: 'square_footage', nullable: true })
    squareFootage: number;

    @Column({ type: 'text', name: 'services_offered', array: true, nullable: true })
    servicesOffered: string[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

