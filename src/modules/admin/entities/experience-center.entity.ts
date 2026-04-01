import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ECType {
    FULL = 'FULL',
    MINI = 'MINI',
}

@Entity('experience_centers')
export class ExperienceCenter {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'name' })
    name: string; // E.g., Bangalore Main EC

    @Column({ type: 'enum', enum: ECType, default: ECType.FULL })
    type: ECType;

    @Column({ nullable: true })
    city: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ name: 'manager_name', nullable: true })
    managerName: string;

    @Column({ name: 'manager_contact', nullable: true })
    managerContact: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    // ── DINGG Integration Credentials (per-EC) ────────────────────────────
    // Obtained from DINGG tech-partner team. Each EC has its own credentials
    // corresponding to its vendor_location_uuid in DINGG's system.

    @Column({ name: 'dingg_access_code', nullable: true, select: false })
    dinggAccessCode: string;  // tech-partner access code

    @Column({ name: 'dingg_api_key', nullable: true, select: false })
    dinggApiKey: string;      // tech-partner API key

    @Column({ name: 'dingg_vendor_location_uuid', nullable: true })
    dinggVendorLocationUuid: string; // UUID from GET /tech-partner/locations

    // Cached auth token — refreshed automatically by DinggService, stored here
    // so the token survives server restarts and is shared across instances.
    @Column({ name: 'dingg_token', type: 'text', nullable: true, select: false })
    dinggToken: string | null;

    @Column({ name: 'dingg_token_expires_at', type: 'timestamp', nullable: true })
    dinggTokenExpiresAt: Date | null;

    // Whether DINGG integration is enabled for this EC
    @Column({ name: 'dingg_enabled', default: false })
    dinggEnabled: boolean;

    // Stylists assigned to this EC
    @OneToMany(() => User, (user) => user.ec)
    stylists: User[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
