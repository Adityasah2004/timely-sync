-- ================================================================
-- Timely — Migration: Add Favorite/Pin Flag to Startup Docs
-- ================================================================

-- Add is_favorite column to docs (defaulting to false)
ALTER TABLE docs ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
