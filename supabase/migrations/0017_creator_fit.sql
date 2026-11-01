-- Creator relevance (v0.2 1.4): how well each result's account fits the product, what kind of account it is, and
-- why (one short line shown on the card). Null on researches made before this.
alter table public.run_results add column if not exists creator_fit smallint check (creator_fit between 0 and 2);
alter table public.run_results add column if not exists account_type text
  check (account_type is null or account_type in ('brand', 'creator', 'media', 'founder', 'other'));
alter table public.run_results add column if not exists creator_why text check (creator_why is null or char_length(creator_why) <= 160);

-- Test set: a re-run of a brief points at the research it repeats, so before/after compares the same brief.
alter table public.eval_briefs add column if not exists parent_run_id uuid references public.research_runs (id) on delete set null;
