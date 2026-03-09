import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('fb_lead_forms')
export class FbLeadForm {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'fb_form_id', unique: true })
    fbFormId: string;

    @Column({ name: 'form_name' })
    formName: string;

    @Column({ name: 'fb_page_id' })
    fbPageId: string;

    @Column({ name: 'status', default: 'active' })
    status: string;

    @Column({ name: 'sync_enabled', default: false })
    syncEnabled: boolean;

    @Column({ name: 'questions', type: 'jsonb', default: [] })
    questions: Record<string, any>[];

    // FB question key → our CreateLeadDto field name
    // e.g. { "full_name": "name", "phone_number": "phone", "city": "city" }
    @Column({ name: 'field_mapping', type: 'jsonb', default: {} })
    fieldMapping: Record<string, string>;

    @Column({ name: 'leads_synced', default: 0 })
    leadsSynced: number;

    @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
    lastSyncedAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
