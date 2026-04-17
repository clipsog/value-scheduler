-- Run once if your DB was created before `places` existed.
ALTER TABLE asset_scheduler_state
  ADD COLUMN IF NOT EXISTS places jsonb NOT NULL DEFAULT '[]'::jsonb;
