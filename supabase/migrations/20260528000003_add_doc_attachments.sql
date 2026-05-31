-- ================================================================
-- Timely — Migration: Add Document Attachments and Storage Bucket
-- ================================================================

ALTER TABLE docs ADD COLUMN IF NOT EXISTS attachments jsonb[] DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
VALUES ('doc-attachments', 'doc-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent)
DROP POLICY IF EXISTS "Public Read Access"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Anon Insert Access"         ON storage.objects;
DROP POLICY IF EXISTS "Anon Delete Access"         ON storage.objects;

CREATE POLICY "Public Read Access"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'doc-attachments');

CREATE POLICY "Anon Insert Access"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'doc-attachments');

CREATE POLICY "Anon Delete Access"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'doc-attachments');
