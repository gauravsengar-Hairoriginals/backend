import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    Index,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';

export enum ProductStatus {
    ACTIVE = 'active',
    DRAFT = 'draft',
    ARCHIVED = 'archived',
}

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'shopify_id', unique: true })
    @Index()
    shopifyId: string;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ unique: true })
    handle: string;

    @Column({ name: 'product_type', nullable: true })
    productType: string;

    @Column({ nullable: true })
    vendor: string;

    @Column({
        type: 'enum',
        enum: ProductStatus,
        default: ProductStatus.ACTIVE,
    })
    status: ProductStatus;

    @Column('simple-array', { nullable: true })
    tags: string[];

    @Column({ type: 'jsonb', nullable: true })
    images: { shopifyId: string; src: string; alt?: string; position: number; width?: number; height?: number }[];

    @Column({ type: 'jsonb', nullable: true })
    options: { name: string; values: string[] }[];

    // SEO fields
    @Column({ name: 'seo_title', nullable: true })
    seoTitle: string;

    @Column({ name: 'seo_description', type: 'text', nullable: true })
    seoDescription: string;

    // Collections (Shopify collections this product belongs to)
    @Column('simple-array', { nullable: true })
    collections: string[];

    // Metafields (custom product attributes from Shopify)
    @Column({ type: 'jsonb', nullable: true })
    metafields: { namespace: string; key: string; value: string; type: string }[];

    // Videos (product videos/media)
    @Column({ type: 'jsonb', nullable: true })
    videos: { shopifyId: string; src: string; alt?: string; position: number }[];

    // Hair-specific fields (from metafields)
    @Column({ name: 'hair_color', nullable: true })
    hairColor: string;

    @Column({ name: 'hair_length', nullable: true })
    hairLength: string;

    @Column({ name: 'hair_weight', nullable: true })
    hairWeight: string;

    @Column({ name: 'hair_texture', nullable: true })
    hairTexture: string;

    @Column({ name: 'hair_material', nullable: true })
    hairMaterial: string;

    @Column({ name: 'clip_count', nullable: true })
    clipCount: number;

    @Column({ name: 'base_type', nullable: true })
    baseType: string;

    @OneToMany(() => ProductVariant, (variant) => variant.product, {
        cascade: true,
        eager: true,
    })
    variants: ProductVariant[];

    @Column({ name: 'synced_at', nullable: true })
    syncedAt: Date;

    @Column({ name: 'shopify_created_at', nullable: true })
    shopifyCreatedAt: Date;

    @Column({ name: 'shopify_updated_at', nullable: true })
    shopifyUpdatedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

