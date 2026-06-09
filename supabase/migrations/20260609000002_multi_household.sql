-- Migration: Multi-Household support and active household switching

BEGIN;

-- 1. Add active_household_id to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_household_id uuid REFERENCES households(id) ON DELETE SET NULL;

-- 2. Create household_members join table
CREATE TABLE IF NOT EXISTS household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  short_id     char(1) NOT NULL, -- slot in the household (1 to 8)
  role_label   text,
  tagline      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, household_id),
  UNIQUE (household_id, short_id)
);

-- Enable RLS on household_members
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- 3. Migrate existing profile membership data to household_members table
INSERT INTO household_members (user_id, household_id, short_id, role_label, tagline)
SELECT id, household_id, short_id, role_label, tagline
FROM profiles
WHERE household_id IS NOT NULL
ON CONFLICT (user_id, household_id) DO NOTHING;

-- 4. Set active_household_id for existing profiles
UPDATE profiles
SET active_household_id = household_id
WHERE household_id IS NOT NULL AND active_household_id IS NULL;

-- 5. Make obsolete columns nullable instead of dropping them (to preserve dependencies like products/sprints policies)
ALTER TABLE profiles ALTER COLUMN household_id DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN short_id DROP NOT NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_short_id_check;

-- 6. Update get_my_household_id() to read active_household_id instead of household_id
CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT active_household_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 7. Setup RLS policies on household_members
-- Select is open to verify available slots before joining, and to fetch housemates
DROP POLICY IF EXISTS "household_members: select" ON household_members;
CREATE POLICY "household_members: select"
  ON household_members FOR SELECT TO anon, authenticated
  USING (true);

-- Users can insert their own memberships
DROP POLICY IF EXISTS "household_members: insert" ON household_members;
CREATE POLICY "household_members: insert"
  ON household_members FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own membership, or household admins (short_id = '1') can update members' settings
DROP POLICY IF EXISTS "household_members: update" ON household_members;
CREATE POLICY "household_members: update"
  ON household_members FOR UPDATE TO anon, authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM household_members AS admin_hm
      WHERE admin_hm.user_id = auth.uid()
        AND admin_hm.short_id = '1'
        AND admin_hm.household_id = household_members.household_id
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM household_members AS admin_hm
      WHERE admin_hm.user_id = auth.uid()
        AND admin_hm.short_id = '1'
        AND admin_hm.household_id = household_members.household_id
    )
  );

-- Users can delete their own membership (leaving), or household admins can delete memberships (removing members)
DROP POLICY IF EXISTS "household_members: delete" ON household_members;
CREATE POLICY "household_members: delete"
  ON household_members FOR DELETE TO anon, authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM household_members AS admin_hm
      WHERE admin_hm.user_id = auth.uid()
        AND admin_hm.short_id = '1'
        AND admin_hm.household_id = household_members.household_id
    )
  );

-- 8. Update profiles RLS update policy to allow updating active_household_id to a household they belong to
DROP POLICY IF EXISTS "profiles: update" ON profiles;
CREATE POLICY "profiles: update"
  ON profiles FOR UPDATE TO anon, authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND (
      active_household_id IS NULL OR
      EXISTS (
        SELECT 1 FROM household_members
        WHERE user_id = auth.uid() AND household_id = active_household_id
      )
    )
  );

-- 9. Add household_members table to the realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'household_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE household_members;
  END IF;
END $$;

COMMIT;
