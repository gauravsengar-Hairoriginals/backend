import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { Level } from '../../../common/enums/level.enum';
import { Salon } from '../../salons/entities/salon.entity';
import { Referral } from '../../referrals/entities/referral.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true, nullable: true })
    email: string;

    @Column({ unique: true })
    phone: string;

    @Column({ name: 'password_hash' })
    passwordHash: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.SALES_EXECUTIVE,
    })
    role: UserRole;

    @Column({ nullable: true })
    department: string;

    @Column({
        type: 'enum',
        enum: Level,
        default: Level.SILVER
    })
    level: Level;

    @Column({ name: 'reports_to_id', nullable: true })
    reportsToId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'reports_to_id' })
    reportsTo: User;

    @Column({ type: 'jsonb', nullable: true, default: [] })
    permissions: string[];

    // Salon relationship (for STYLIST role)
    @Column({ name: 'salon_id', nullable: true })
    salonId: string;

    @ManyToOne(() => Salon, (salon) => salon.stylists, { nullable: true })
    @JoinColumn({ name: 'salon_id' })
    salon: Salon;

    @OneToMany(() => Referral, (referral) => referral.referrer)
    referrals: Referral[];

    // Salons owned by this user (Partner App)
    @OneToMany(() => Salon, (salon) => salon.owner)
    ownedSalons: Salon[];

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'is_email_verified', default: false })
    isEmailVerified: boolean;

    @Column({ name: 'is_phone_verified', default: false })
    isPhoneVerified: boolean;

    @Column({ name: 'last_login_at', nullable: true })
    lastLoginAt: Date;

    @Column({ name: 'failed_login_attempts', default: 0 })
    failedLoginAttempts: number;

    @Column({ name: 'locked_until', nullable: true })
    lockedUntil: Date;

    @Column({ name: 'password_changed_at', nullable: true })
    passwordChangedAt: Date;

    @Column({ name: 'bank_account_number', nullable: true })
    bankAccountNumber: string;

    @Column({ name: 'bank_account_name', nullable: true })
    bankAccountName: string;

    @Column({ name: 'bank_ifsc', nullable: true })
    bankIFSC: string;

    @Column({ name: 'bank_name', nullable: true })
    bankName: string;

    @Column({ name: 'upi_phone', nullable: true })
    upiPhone: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

