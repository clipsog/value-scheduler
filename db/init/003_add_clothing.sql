-- Wardrobe / clothing items JSON column (matches local API schema).
ALTER TABLE asset_scheduler_state
  ADD COLUMN IF NOT EXISTS clothing jsonb NOT NULL DEFAULT '[]'::jsonb;
