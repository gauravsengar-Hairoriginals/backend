import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
