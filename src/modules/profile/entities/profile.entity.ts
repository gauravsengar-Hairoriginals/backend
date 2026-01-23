import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('profiles')
export class Profile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', unique: true })
    userId: string;

    @OneToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    // Common fields for all users
    @Column({ nullable: true })
    avatar: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true })
    state: string;

    @Column({ nullable: true })
    pincode: string;

    // Stylist-specific fields
    @Column({ name: 'salon_name', nullable: true })
    salonName: string;

    @Column({ name: 'salon_address', nullable: true })
    salonAddress: string;

    @Column({ name: 'salon_city', nullable: true })
    salonCity: string;

    @Column({ name: 'salon_pincode', nullable: true })
    salonPincode: string;

    @Column({ name: 'years_of_experience', nullable: true })
    yearsOfExperience: number;

    @Column('simple-array', { nullable: true })
    specializations: string[];

    // Field Agent-specific fields
    @Column({ name: 'vehicle_type', nullable: true })
    vehicleType: string;

    @Column({ name: 'vehicle_number', nullable: true })
    vehicleNumber: string;

    @Column({ name: 'emergency_contact', nullable: true })
    emergencyContact: string;

    // Bank details (for Stylist and Field Agent payouts)
    @Column({ name: 'bank_account_number', nullable: true })
    bankAccountNumber: string;

    @Column({ name: 'bank_ifsc', nullable: true })
    bankIfsc: string;

    @Column({ name: 'bank_account_holder', nullable: true })
    bankAccountHolder: string;

    @Column({ name: 'pan_number', nullable: true })
    panNumber: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
