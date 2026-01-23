import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

export enum CommissionType {
    PERCENTAGE = 'percentage',
    FIXED = 'fixed',
    TIERED = 'tiered',
}

export interface CommissionTier {
    minAmount: number;
    maxAmount: number | null;
    rate: number;
}

@Entity('commission_rules')
export class CommissionRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({
        type: 'enum',
        enum: CommissionType,
        default: CommissionType.PERCENTAGE,
    })
    type: CommissionType;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    value: number;

    @Column({ type: 'jsonb', nullable: true })
    tiers: CommissionTier[];

    @Column({ name: 'role_applicable', type: 'simple-array', nullable: true })
    roleApplicable: string[];

    @Column({ name: 'product_ids', type: 'simple-array', nullable: true })
    productIds: string[];

    @Column({ name: 'stylist_ids', type: 'simple-array', nullable: true })
    stylistIds: string[];

    @Column({ name: 'min_order_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
    minOrderAmount: number;

    @Column({ name: 'max_commission', type: 'decimal', precision: 10, scale: 2, nullable: true })
    maxCommission: number;

    @Column({ default: 0 })
    priority: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'valid_from', nullable: true })
    validFrom: Date;

    @Column({ name: 'valid_until', nullable: true })
    validUntil: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
