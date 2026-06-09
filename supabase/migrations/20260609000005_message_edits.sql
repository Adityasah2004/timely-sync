ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS original_content text;
