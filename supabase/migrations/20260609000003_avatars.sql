-- Add avatar support to profiles and households

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE households ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE households ADD COLUMN IF NOT EXISTS display_name text;

-- Update household display_name from existing name column
UPDATE households SET display_name = name WHERE display_name IS NULL;

-- Storage: Create avatars bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

-- Storage RLS policies for avatars bucket (bucket-scoped, authenticated users only)
DROP POLICY IF EXISTS "avatars: upload own"   ON storage.objects;
DROP POLICY IF EXISTS "avatars: update own"   ON storage.objects;
DROP POLICY IF EXISTS "avatars: public read"  ON storage.objects;
DROP POLICY IF EXISTS "avatars: delete own"   ON storage.objects;

CREATE POLICY "avatars: insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars: update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: select"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');
