-- ================================================================
-- Timely — Migration: Add Project Management attributes to Todos
-- ================================================================

-- Add status column (defaulting to TODO, constrained to valid Kanban phases)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'TODO' 
  CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'));

-- Add project_name column (defaulting to 'General')
ALTER TABLE todos ADD COLUMN IF NOT EXISTS project_name text NOT NULL DEFAULT 'General';

-- Add notes column (for description/markdown notes)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS notes text DEFAULT '';

-- Add estimated_hours column (for workload estimation)
ALTER TABLE todos ADD COLUMN IF NOT EXISTS estimated_hours integer DEFAULT NULL;

-- Migrate existing data: map is_done to status
UPDATE todos SET status = 'DONE' WHERE is_done = true AND status = 'TODO';
UPDATE todos SET status = 'TODO' WHERE is_done = false AND status = 'DONE';
