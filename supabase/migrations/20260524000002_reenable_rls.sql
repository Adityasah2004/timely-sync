-- Re-enable RLS on all tables with correct, recursion-free policies.
-- get_my_household_id() (security definer) was created in migration _002.
-- All policies use anon+authenticated since the app uses the anon key.

ALTER TABLE households    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

-- Drop all old policies (clean slate)
DROP POLICY IF EXISTS "households: members can read"           ON households;
DROP POLICY IF EXISTS "households: anyone can insert"          ON households;
DROP POLICY IF EXISTS "households: authenticated can insert"   ON households;
DROP POLICY IF EXISTS "households: insert"                     ON households;
DROP POLICY IF EXISTS "households: select"                     ON households;
DROP POLICY IF EXISTS "households: update"                     ON households;
DROP POLICY IF EXISTS "profiles: household members can read"   ON profiles;
DROP POLICY IF EXISTS "profiles: user can update own"          ON profiles;
DROP POLICY IF EXISTS "profiles: user can insert own"          ON profiles;
DROP POLICY IF EXISTS "profiles: own"                          ON profiles;
DROP POLICY IF EXISTS "profiles: household read"               ON profiles;
DROP POLICY IF EXISTS "profiles: insert"                       ON profiles;
DROP POLICY IF EXISTS "profiles: update"                       ON profiles;
DROP POLICY IF EXISTS "events: household"                      ON events;
DROP POLICY IF EXISTS "todos: household"                       ON todos;
DROP POLICY IF EXISTS "alarms: household"                      ON alarms;
DROP POLICY IF EXISTS "activity: household"                    ON activity;
DROP POLICY IF EXISTS "notifications: household"               ON notifications;
DROP POLICY IF EXISTS "focus_sessions: household"              ON focus_sessions;

-- households
CREATE POLICY "households: insert"
  ON households FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "households: select"
  ON households FOR SELECT TO anon, authenticated
  USING (id = get_my_household_id());

CREATE POLICY "households: update"
  ON households FOR UPDATE TO anon, authenticated
  USING     (id = get_my_household_id())
  WITH CHECK (id = get_my_household_id());

-- profiles: readable only within same household; insert open for onboarding
CREATE POLICY "profiles: household read"
  ON profiles FOR SELECT TO anon, authenticated
  USING (household_id = get_my_household_id());

CREATE POLICY "profiles: insert"
  ON profiles FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "profiles: update"
  ON profiles FOR UPDATE TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

-- events / todos / alarms / activity
CREATE POLICY "events: household"
  ON events FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "todos: household"
  ON todos FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "alarms: household"
  ON alarms FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "activity: household"
  ON activity FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "notifications: household"
  ON notifications FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());

CREATE POLICY "focus_sessions: household"
  ON focus_sessions FOR ALL TO anon, authenticated
  USING     (household_id = get_my_household_id())
  WITH CHECK (household_id = get_my_household_id());
