-- Chat-style home: keep what the user sent (text, link, image summary) and what Reely understood,
-- plus the region choice and the region of each keyword (parallel to keywords).
alter table public.research_runs
  add column if not exists title text,
  add column if not exists region text not null default 'th' check (region in ('th', 'global', 'both')),
  add column if not exists keyword_regions text[],
  add column if not exists input jsonb;
