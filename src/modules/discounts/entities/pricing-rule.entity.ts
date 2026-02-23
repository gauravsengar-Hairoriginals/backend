import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity('pricing_rules')
export class PricingRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'shopify_price_rule_id', unique: true })
    @Index()
    shopifyPriceRuleId: string;

    @Column()
    title: string;

    @Column({ name: 'value_type' })
    valueType: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    value: number;

    @Column({ name: 'min_order_amount', type: 'decimal', precision: 10, scale: 2, nullable: true })
    minOrderAmount: number | null;

    @Column({ name: 'starts_at', type: 'timestamp', nullable: true })
    startsAt: Date;

    @Column({ name: 'ends_at', type: 'timestamp', nullable: true })
    endsAt: Date | null;

    @Column({ name: 'usage_limit', type: 'int', nullable: true })
    usageLimit: number | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
