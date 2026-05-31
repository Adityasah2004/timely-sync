-- ================================================================
-- Timely — Migration: Add Subtasks and Multi-Assignment to Todos
-- ================================================================

-- Ensure assigned_to is a text[] array to support multiple assignees
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'todos' AND column_name = 'assigned_to' AND data_type = 'text'
  ) THEN
    ALTER TABLE todos ALTER COLUMN assigned_to TYPE text[] USING CASE WHEN assigned_to IS NULL THEN NULL ELSE ARRAY[assigned_to] END;
  ELSE
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS assigned_to text[] DEFAULT NULL;
  END IF;
END $$;

-- Add parent_id column (references todos.id self-relation, cascades delete)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES todos(id) ON DELETE CASCADE DEFAULT NULL;
