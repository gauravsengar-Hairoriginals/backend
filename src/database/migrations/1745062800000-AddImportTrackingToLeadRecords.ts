import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddImportTrackingToLeadRecords
 *
 * Adds two columns to lead_records for import deduplication:
 *  - lsq_lead_id  : LeadSquared's own lead UUID (used for LSQ import dedup)
 *  - add_on_date  : ISO date string (YYYY-MM-DD) of the original lead creation
 *                   date in the source system (used for phone+date dedup)
 */
export class AddImportTrackingToLeadRecords1745062800000 implements MigrationInterface {
    name = 'AddImportTrackingToLeadRecords1745062800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE lead_records
                ADD COLUMN IF NOT EXISTS lsq_lead_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS add_on_date  VARCHAR(20)
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_lead_records_lsq_lead_id
                ON lead_records (lsq_lead_id)
                WHERE lsq_lead_id IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_lead_records_lsq_lead_id`);
        await queryRunner.query(`
            ALTER TABLE lead_records
                DROP COLUMN IF EXISTS lsq_lead_id,
                DROP COLUMN IF EXISTS add_on_date
        `);
    }
}
