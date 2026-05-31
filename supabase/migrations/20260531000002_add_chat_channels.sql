-- ================================================================
-- Timely — Migration: Add Channels Table for Chat Rooms
-- ================================================================

CREATE TABLE IF NOT EXISTS channels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name             text NOT NULL,
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  members          text[] DEFAULT NULL,
  passphrase_check text DEFAULT NULL,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE CASCADE DEFAULT NULL;

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channels: household" ON channels;

CREATE POLICY "channels: household"
  ON channels FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE channels;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
