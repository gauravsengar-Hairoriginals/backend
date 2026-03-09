import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('fb_config')
export class FbConfig {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'page_id' })
    pageId: string;

    @Column({ name: 'page_name', nullable: true })
    pageName: string;

    @Column({ name: 'access_token', type: 'text' })
    accessToken: string;

    @Column({ name: 'app_secret', nullable: true })
    appSecret: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
