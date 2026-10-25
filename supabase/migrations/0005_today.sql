-- Quality stats per run, followed topics, and the daily "Today" digest.

-- How many results the noise filter and the AI relevance check removed.
alter table public.research_runs add column if not exists stats jsonb;
-- A followed run is re-searched (last 7 days) for the Today page. Max 2 per user (enforced in the app).
alter table public.research_runs add column if not exists followed_at timestamptz;

-- One digest per user per day (Bangkok date), so reopening Today costs nothing.
create table if not exists public.daily_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  items jsonb not null default '[]',
  stats jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

alter table public.daily_digests enable row level security;
create policy "own digests" on public.daily_digests for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
