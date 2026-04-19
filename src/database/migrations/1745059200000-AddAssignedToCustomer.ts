import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddAssignedToCustomer
 *
 * Moves the canonical caller assignment from lead_records to customers.
 * lead_records.assigned_to_id remains as a denormalized mirror.
 *
 * Steps:
 *  1. Add assigned_to_id (FK → users) and assigned_to_name to customers.
 *  2. Create an index on customers.assigned_to_id for fast caller-scoped queries.
 *  3. Backfill from each customer's most recently assigned lead record.
 */
export class AddAssignedToCustomer1745059200000 implements MigrationInterface {
    name = 'AddAssignedToCustomer1745059200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── 1. Add new columns ─────────────────────────────────────────────
        await queryRunner.query(`
            ALTER TABLE customers
                ADD COLUMN IF NOT EXISTS assigned_to_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(255)
        `);

        // ── 2. Index on the new FK for fast queries ────────────────────────
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_customers_assigned_to_id
                ON customers (assigned_to_id)
        `);

        // ── 3. Backfill: inherit assignment from the most recent assigned lead ──
        await queryRunner.query(`
            UPDATE customers c
            SET
                assigned_to_id   = sub.assigned_to_id,
                assigned_to_name = sub.assigned_to_name
            FROM (
                SELECT DISTINCT ON (customer_id)
                    customer_id,
                    assigned_to_id,
                    assigned_to_name
                FROM lead_records
                WHERE assigned_to_id IS NOT NULL
                ORDER BY customer_id, created_at DESC
            ) sub
            WHERE c.id = sub.customer_id
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_customers_assigned_to_id`);
        await queryRunner.query(`
            ALTER TABLE customers
                DROP COLUMN IF EXISTS assigned_to_id,
                DROP COLUMN IF EXISTS assigned_to_name
        `);
    }
}
