import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { UserRole } from '../enums/user-role.enum';

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

    @Column({ name: 'reports_to_id', nullable: true })
    reportsToId: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'reports_to_id' })
    reportsTo: User;

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

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
