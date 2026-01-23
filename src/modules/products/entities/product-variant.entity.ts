import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_variants')
export class ProductVariant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'shopify_variant_id', unique: true })
    @Index()
    shopifyVariantId: string;

    @Column({ name: 'product_id' })
    productId: string;

    @ManyToOne(() => Product, (product) => product.variants, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column()
    title: string;

    @Column({ nullable: true })
    sku: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column({ name: 'compare_at_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    compareAtPrice: number;

    @Column({ name: 'inventory_quantity', default: 0 })
    inventoryQuantity: number;

    @Column({ nullable: true })
    barcode: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    weight: number;

    @Column({ name: 'weight_unit', nullable: true })
    weightUnit: string;

    @Column({ nullable: true })
    option1: string;

    @Column({ nullable: true })
    option2: string;

    @Column({ nullable: true })
    option3: string;

    @Column({ name: 'requires_shipping', default: true })
    requiresShipping: boolean;

    @Column({ default: true })
    taxable: boolean;

    @Column({ nullable: true, name: 'image_url' })
    imageUrl: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
