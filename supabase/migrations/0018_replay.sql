-- Search quality S0: replay and judge check. Run BEFORE deploying the code that writes these columns.

-- The search's own relevance score for each result (2 on target, 1 same field, 0 off), so order variants can be
-- replayed on stored results. Null on researches made before this until the test set's replay fills it.
alter table public.run_results add column if not exists relevance smallint check (relevance between 0 and 2);

-- Every clip an owner's research found, kept or dropped, and why (drop_reason null = kept). Lets filter changes (view
-- floor, keep rule) be replayed without credits. Owner researches only; server-only like the eval tables (RLS on, no
-- policies: only the service role reads or writes).
create table if not exists public.run_candidates (
  run_id uuid not null references public.research_runs (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'youtube', 'instagram')),
  platform_video_id text not null check (char_length(platform_video_id) <= 100),
  handle text not null check (char_length(handle) <= 100),
  caption text check (caption is null or char_length(caption) <= 300),
  views bigint,
  followers bigint,
  published_at timestamptz,
  keyword text check (keyword is null or char_length(keyword) <= 120),
  drop_reason text check (drop_reason is null or drop_reason in ('views', 'old', 'language', 'excluded', 'offTopic', 'offCreator')),
  relevance smallint check (relevance between 0 and 2),
  creator_fit smallint check (creator_fit between 0 and 2),
  primary key (run_id, platform, platform_video_id)
);
alter table public.run_candidates enable row level security;

-- Labels the owner gave without seeing the AI judge's answer: only these measure how far the judge can be trusted.
alter table public.relevance_labels add column if not exists blind boolean not null default false;

-- Hold-out briefs: measured with every change, never tuned on.
alter table public.eval_briefs add column if not exists holdout boolean not null default false;
