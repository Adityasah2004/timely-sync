-- ================================================================
-- Timely — Migration: Add Chat Messages for Startup War Room
-- ================================================================

CREATE TABLE IF NOT EXISTS messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  sender_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sender_short char(1) NOT NULL,
  content      text NOT NULL,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages: household" ON messages;

CREATE POLICY "messages: household"
  ON messages FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
