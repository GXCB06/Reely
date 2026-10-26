-- Phase 1-3: video country / TikTok Shop / sound, search settings, refreshable research, format explorer.

alter table public.videos
  add column if not exists country text,
  add column if not exists has_shop boolean not null default false,
  add column if not exists sound_id text,
  add column if not exists sound_title text,
  add column if not exists sound_author text,
  add column if not exists sound_original boolean;
create index if not exists videos_sound_idx on public.videos (sound_id);

-- Search settings ({ days, minViews }) and the last "update with new videos".
alter table public.research_runs
  add column if not exists settings jsonb,
  add column if not exists last_refreshed_at timestamptz;
-- When a result was added: results from a refresh show as "new".
alter table public.run_results add column if not exists added_at timestamptz not null default now();

-- Format explorer: shared cache, one row per seed video, rebuilt after 3 days.
create table if not exists public.formats (
  id uuid primary key default gen_random_uuid(),
  seed_video_id bigint not null unique references public.videos (id) on delete cascade,
  data jsonb not null,
  video_ids bigint[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.formats enable row level security;
create policy "read formats" on public.formats for select to authenticated using (true);

-- Results that existed before this migration were not added by an update: date them to their research.
update public.run_results rr set added_at = r.created_at
from public.research_runs r
where rr.run_id = r.id and r.last_refreshed_at is null;
