import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

export enum HairConcern {
    THINNING = 'thinning',
    BALDNESS = 'baldness',
    VOLUME = 'volume',
    LENGTH = 'length',
    COLOR = 'color',
    TEXTURE = 'texture',
}

export enum PriceSensitivity {
    PRICE_CONSCIOUS = 'price_conscious',
    VALUE_SEEKER = 'value_seeker',
    QUALITY_FOCUSED = 'quality_focused',
    PREMIUM_BUYER = 'premium_buyer',
}

@Entity('customer_profiles')
export class CustomerProfile {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'customer_id', unique: true })
    customerId: string;

    @OneToOne(() => Customer, (customer) => customer.profile)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    // Hair Condition & Needs
    @Column({ name: 'hair_type', nullable: true })
    hairType: string;

    @Column({ name: 'hair_concern', nullable: true })
    hairConcern: string;

    @Column({ name: 'hair_loss_type', nullable: true })
    hairLossType: string;

    @Column({ name: 'natural_hair_color', nullable: true })
    naturalHairColor: string;

    @Column({ name: 'natural_hair_texture', nullable: true })
    naturalHairTexture: string;

    @Column({ name: 'natural_hair_length', nullable: true })
    naturalHairLength: string;

    @Column({ name: 'scalp_sensitivity', nullable: true })
    scalpSensitivity: string;

    // Styling Preferences
    @Column({ name: 'preferred_style', nullable: true })
    preferredStyle: string;

    @Column({ name: 'color_preference', nullable: true })
    colorPreference: string;

    @Column({ name: 'maintenance_preference', nullable: true })
    maintenancePreference: string;

    // Economic Status
    @Column({ name: 'income_bracket', nullable: true })
    incomeBracket: string;

    @Column({ nullable: true })
    profession: string;

    // Price Sensitivity
    @Column({
        name: 'price_sensitivity',
        type: 'enum',
        enum: PriceSensitivity,
        nullable: true,
    })
    priceSensitivity: PriceSensitivity;

    @Column({ name: 'preferred_price_range', nullable: true })
    preferredPriceRange: string;

    @Column({ name: 'willing_to_pay_emi', default: false })
    willingToPayEmi: boolean;

    // Purchase Behavior
    @Column({ name: 'decision_speed', nullable: true })
    decisionSpeed: string;

    @Column({ name: 'needs_consultation', default: true })
    needsConsultation: boolean;

    @Column({ name: 'prefers_home_trial', default: false })
    prefersHomeTrial: boolean;

    @Column({ name: 'prefers_store_visit', default: false })
    prefersStoreVisit: boolean;

    // Product Affinity
    @Column({ name: 'interested_categories', type: 'jsonb', nullable: true })
    interestedCategories: string[];

    @Column({ name: 'purchased_categories', type: 'jsonb', nullable: true })
    purchasedCategories: string[];

    @Column({ name: 'viewed_products', type: 'jsonb', nullable: true })
    viewedProducts: string[];

    @Column({ name: 'wishlisted_products', type: 'jsonb', nullable: true })
    wishlistedProducts: string[];

    // Engagement
    @Column({ name: 'engagement_score', nullable: true })
    engagementScore: number;

    @Column({ name: 'nps_score', nullable: true })
    npsScore: number;

    @Column({ name: 'has_left_review', default: false })
    hasLeftReview: boolean;

    @Column({ name: 'is_referrer', default: false })
    isReferrer: boolean;

    // Recommendations
    @Column({ name: 'recommended_product_ids', type: 'jsonb', nullable: true })
    recommendedProductIds: string[];

    // Profile Completeness
    @Column({ name: 'profile_completeness_percent', default: 0 })
    profileCompletenessPercent: number;

    @Column({ name: 'profile_source', nullable: true })
    profileSource: string;

    @Column({ name: 'last_profile_update', nullable: true })
    lastProfileUpdate: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
