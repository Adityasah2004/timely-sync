ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_content text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender char(1);
