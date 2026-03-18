import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('city_regions')
export class CityRegion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'region_code', unique: true })
    regionCode: string; // e.g. 'DELHI_NCR', 'BANGALORE'

    @Column({ name: 'region_name' })
    regionName: string; // e.g. 'Delhi NCR', 'Bangalore'

    @Column({ type: 'jsonb', default: '[]' })
    cities: string[]; // lowercase city name fragments, e.g. ['delhi', 'noida', 'gurugram']

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
