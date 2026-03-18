-- ============================================================
-- Migration: v1_city_regions_and_multi_region_callers
-- Date:       2026-03-18
-- Description:
--   1. Create `city_regions` table (dynamic city-to-region config)
--   2. Seed default regions (Delhi NCR, Hyderabad, Mumbai, Rest of India)
--   3. Add `caller_regions` jsonb[] column to `users`
--   4. Migrate existing `caller_region` enum value → `caller_regions` array
--   5. Drop the old `caller_region` enum column
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Create city_regions table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "city_regions" (
    "id"          UUID            NOT NULL DEFAULT gen_random_uuid(),
    "region_code" VARCHAR         NOT NULL,
    "region_name" VARCHAR         NOT NULL,
    "cities"      JSONB           NOT NULL DEFAULT '[]',
    "is_active"   BOOLEAN         NOT NULL DEFAULT TRUE,
    "created_at"  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT "PK_city_regions"         PRIMARY KEY ("id"),
    CONSTRAINT "UQ_city_regions_code"    UNIQUE ("region_code")
);

-- ────────────────────────────────────────────────────────────
-- 2. Seed default regions (skip if already seeded)
-- ────────────────────────────────────────────────────────────
INSERT INTO "city_regions" ("region_code", "region_name", "cities", "is_active")
VALUES
    ('DELHI_NCR',     'Delhi NCR',      '["delhi","noida","gurugram","gurgaon","faridabad","ghaziabad","greater noida","ncr"]',     TRUE),
    ('HYDERABAD',     'Hyderabad',       '["hyderabad","secunderabad","cyberabad"]',                                                 TRUE),
    ('MUMBAI',        'Mumbai',          '["mumbai","thane","navi mumbai","pune","nashik"]',                                         TRUE),
    ('REST_OF_INDIA', 'Rest of India',   '[]',                                                                                      TRUE)
ON CONFLICT ("region_code") DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. Add caller_regions jsonb column to users
--    (nullable so existing rows don't break)
-- ────────────────────────────────────────────────────────────
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "caller_regions" JSONB DEFAULT '[]';

-- ────────────────────────────────────────────────────────────
-- 4. Migrate existing caller_region value → caller_regions array
--    Only applies to rows that still have a non-null caller_region
-- ────────────────────────────────────────────────────────────
UPDATE "users"
SET    "caller_regions" = to_jsonb(ARRAY[caller_region::TEXT])
WHERE  "caller_region" IS NOT NULL
  AND  ("caller_regions" IS NULL OR "caller_regions" = '[]'::jsonb);

-- ────────────────────────────────────────────────────────────
-- 5. Drop the old caller_region enum column
--    The enum type (users_caller_region_enum) is left in place
--    in case other objects reference it; drop manually if desired.
-- ────────────────────────────────────────────────────────────
ALTER TABLE "users"
    DROP COLUMN IF EXISTS "caller_region";

-- Optional: drop the now-unused enum type
-- DROP TYPE IF EXISTS "public"."users_caller_region_enum";

COMMIT;
