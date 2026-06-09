-- Fix Row Level Security (RLS) policies for joining households and enable Realtime for profiles
-- This migration drops the restrictive select/update policies and replaces them
-- with policies that allow checking household existence, joining, leaving, and admin removal.

BEGIN;

-- 1. Allow any authenticated or anon user to select households (needed to verify invite code exists)
DROP POLICY IF EXISTS "households: select" ON households;
CREATE POLICY "households: select"
  ON households FOR SELECT TO anon, authenticated
  USING (true);

-- 2. Allow any user to update their own profile, and allow household admins (short_id = '1') to update profiles in their household (e.g. to remove a member)
DROP POLICY IF EXISTS "profiles: update" ON profiles;
CREATE POLICY "profiles: update"
  ON profiles FOR UPDATE TO anon, authenticated
  USING (
    id = auth.uid() OR
    (get_my_household_id() = household_id AND (SELECT short_id FROM profiles WHERE id = auth.uid()) = '1')
  )
  WITH CHECK (
    id = auth.uid() OR
    ((SELECT short_id FROM profiles WHERE id = auth.uid()) = '1')
  );

-- 3. Allow selecting profiles (needed to see taken slots in the household before joining, and for realtime synchronization)
DROP POLICY IF EXISTS "profiles: household read" ON profiles;
CREATE POLICY "profiles: household read"
  ON profiles FOR SELECT TO anon, authenticated
  USING (true);

-- 4. Add profiles table to real-time publication to enable real-time sync for membership changes
-- (Checks if already in publication first to prevent errors on multiple runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;

COMMIT;
