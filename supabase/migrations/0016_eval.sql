-- Relevance test set (v0.2 1.3). Owner-only: RLS is on with no policies, so only the server (service role, after an
-- owner check) reads or writes these tables. Briefs stay in the database, never in the public repo.

-- Researches in the test set. core = re-run live after big search changes.
create table if not exists public.eval_briefs (
  run_id uuid primary key references public.research_runs (id) on delete cascade,
  core boolean not null default false,
  note text check (note is null or char_length(note) <= 200),
  added_at timestamptz not null default now()
);
alter table public.eval_briefs enable row level security;

-- How relevant a clip (item = video id) or a creator (item = 'platform:handle') is for a test brief:
-- 2 on target, 1 same audience / adjacent, 0 off. The AI judge's label and the owner's correction sit side by side.
create table if not exists public.relevance_labels (
  run_id uuid not null references public.research_runs (id) on delete cascade,
  item text not null check (char_length(item) <= 120),
  kind text not null check (kind in ('clip', 'creator')),
  platform text not null check (platform in ('tiktok', 'youtube', 'instagram')),
  label smallint not null check (label between 0 and 2),
  source text not null check (source in ('ai', 'user')),
  reason text check (reason is null or char_length(reason) <= 300),
  model text,
  judged_at timestamptz not null default now(),
  primary key (run_id, item, source)
);
alter table public.relevance_labels enable row level security;

-- The metric table at a point in time ("before 1.5"), to compare each search change with the last one.
create table if not exists public.eval_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 120),
  git_sha text,
  metrics jsonb not null
);
alter table public.eval_snapshots enable row level security;
