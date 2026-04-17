-- Run once in the NEW Supabase project: Dashboard → SQL → New query → Run
-- Asset / Value Scheduler cloud sync table (matches local API + migrations).

create table if not exists public.asset_scheduler_state (
  id text primary key,
  events jsonb not null default '[]'::jsonb,
  subscriptions jsonb not null default '[]'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  places jsonb not null default '[]'::jsonb,
  clothing jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.asset_scheduler_state
  add column if not exists places jsonb not null default '[]'::jsonb;
alter table public.asset_scheduler_state
  add column if not exists clothing jsonb not null default '[]'::jsonb;

insert into public.asset_scheduler_state (id)
values ('asset-scheduler-main')
on conflict (id) do nothing;

alter table public.asset_scheduler_state enable row level security;

drop policy if exists "asset_scheduler_state_anon_all" on public.asset_scheduler_state;
create policy "asset_scheduler_state_anon_all"
  on public.asset_scheduler_state
  for all
  to anon
  using (true)
  with check (true);

grant usage on schema public to anon;
grant select, insert, update, delete on table public.asset_scheduler_state to anon;
