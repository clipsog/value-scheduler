-- Matches Supabase table `asset_scheduler_state` for easy migration.
CREATE TABLE IF NOT EXISTS asset_scheduler_state (
  id text PRIMARY KEY,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  places jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO asset_scheduler_state (id)
VALUES ('asset-scheduler-main')
ON CONFLICT (id) DO NOTHING;
