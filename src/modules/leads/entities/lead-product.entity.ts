import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from 'typeorm';
import { LeadRecord } from './lead-record.entity';
import { Product } from '../../products/entities/product.entity';
import { LeadProductOption } from './lead-product-option.entity';

@Entity('lead_products')
export class LeadProduct {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // ── Parent lead ─────────────────────────────────────────────────────
    @Index()
    @Column({ name: 'lead_record_id' })
    leadRecordId: string;

    @ManyToOne(() => LeadRecord, (lr) => lr.leadProducts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lead_record_id' })
    leadRecord: LeadRecord;

    // ── Referenced product ──────────────────────────────────────────────
    @Index()
    @Column({ name: 'product_id', nullable: true })
    productId: string;

    @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    // Denormalized title – survives product deletion/rename
    @Column({ name: 'product_title' })
    productTitle: string;

    // ── Quantity ─────────────────────────────────────────────────────────
    @Column({ type: 'int', default: 1 })
    quantity: number;

    // ── Selected options (Layer 2) ───────────────────────────────────────
    @OneToMany(() => LeadProductOption, (opt) => opt.leadProduct, {
        cascade: true,
        eager: true,
    })
    options: LeadProductOption[];
}
