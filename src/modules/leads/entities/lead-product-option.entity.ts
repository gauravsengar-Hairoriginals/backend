import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { LeadProduct } from './lead-product.entity';

@Entity('lead_product_options')
export class LeadProductOption {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index()
    @Column({ name: 'lead_product_id' })
    leadProductId: string;

    @ManyToOne(() => LeadProduct, (lp) => lp.options, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lead_product_id' })
    leadProduct: LeadProduct;

    @Column({ name: 'option_name' })
    optionName: string;

    @Column({ name: 'option_value' })
    optionValue: string;
}
