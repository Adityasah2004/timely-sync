-- ================================================================
-- Timely — Migration: Add Startup Docs for Startup War Room
-- ================================================================

CREATE TABLE IF NOT EXISTS docs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title        text NOT NULL,
  content      text NOT NULL,
  tags         text[] NOT NULL DEFAULT '{}',
  created_by   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER docs_updated_at
  BEFORE UPDATE ON docs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docs: household" ON docs;

CREATE POLICY "docs: household"
  ON docs FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE docs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
