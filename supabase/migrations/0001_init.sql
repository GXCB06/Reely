-- Reely initial schema (SPEC.md §8).
-- User-owned tables: each row belongs to one user; RLS allows only that user.
-- Shared cache tables: readable by signed-in users; written only by the server (service role bypasses RLS).

-- ---------- Shared cache ----------

create table public.creators (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  handle text not null,
  display_name text,
  avatar_url text,
  followers bigint,
  usual_views bigint,
  sample_size int,
  fetched_at timestamptz not null default now(),
  unique (platform, handle)
);

create table public.videos (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  platform_video_id text not null,
  url text not null,
  thumbnail_url text,
  caption text not null default '',
  creator_handle text not null,
  creator_followers bigint,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  duration_seconds int,
  published_at timestamptz,
  transcript text,
  fetched_at timestamptz not null default now(),
  unique (platform, platform_video_id)
);
create index videos_creator_idx on public.videos (platform, creator_handle);

create table public.video_analyses (
  video_id bigint primary key references public.videos (id) on delete cascade,
  locale text not null default 'th',
  hook text,
  hook_type text,
  format text,
  angle text,
  cta text,
  why_it_worked text,
  model text,
  created_at timestamptz not null default now()
);

create table public.api_usage (
  day date not null default current_date,
  provider text not null,
  endpoint text not null,
  calls int not null default 0,
  primary key (day, provider, endpoint)
);

-- Atomic counter for paid/external calls; callable only by the server.
create function public.increment_api_usage(p_provider text, p_endpoint text, p_calls int default 1)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.api_usage (day, provider, endpoint, calls)
  values (current_date, p_provider, p_endpoint, p_calls)
  on conflict (day, provider, endpoint)
  do update set calls = public.api_usage.calls + excluded.calls;
$$;
revoke execute on function public.increment_api_usage(text, text, int) from public, anon, authenticated;

-- ---------- User-owned ----------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  url text,
  description text,
  audience text,
  language text not null default 'th',
  created_at timestamptz not null default now()
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  brief text not null,
  keywords text[] not null default '{}',
  exclusions text[] not null default '{}',
  platforms text[] not null default '{youtube,tiktok}',
  status text not null default 'draft' check (status in ('draft', 'running', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.run_results (
  run_id uuid not null references public.research_runs (id) on delete cascade,
  video_id bigint not null references public.videos (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keyword text,
  reach_score numeric,
  usual_score numeric,
  label text check (label in ('breakout', 'strong', 'normal')),
  rank int,
  primary key (run_id, video_id)
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  video_id bigint references public.videos (id) on delete set null,
  locale text not null default 'th',
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table public.tracked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  handle text not null,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);

create table public.saved_videos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id bigint not null references public.videos (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index research_runs_user_idx on public.research_runs (user_id, created_at desc);
create index run_results_user_idx on public.run_results (user_id);
create index scripts_user_idx on public.scripts (user_id);
create index products_user_idx on public.products (user_id);

-- ---------- Row Level Security ----------

alter table public.creators enable row level security;
alter table public.videos enable row level security;
alter table public.video_analyses enable row level security;
alter table public.api_usage enable row level security;
alter table public.products enable row level security;
alter table public.research_runs enable row level security;
alter table public.run_results enable row level security;
alter table public.scripts enable row level security;
alter table public.tracked_accounts enable row level security;
alter table public.saved_videos enable row level security;

-- Shared cache: read-only for signed-in users.
create policy "read creators" on public.creators for select to authenticated using (true);
create policy "read videos" on public.videos for select to authenticated using (true);
create policy "read analyses" on public.video_analyses for select to authenticated using (true);
-- api_usage: no policies, so only the service role can read or write it.

-- User-owned: full access to own rows only.
create policy "own products" on public.products for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own runs" on public.research_runs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own results" on public.run_results for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own scripts" on public.scripts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tracked" on public.tracked_accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own saved" on public.saved_videos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
