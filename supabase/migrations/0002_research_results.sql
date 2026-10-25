-- Day 2: store the AI insight card per run and each result's baseline.
alter table public.research_runs add column summary jsonb;
alter table public.run_results add column usual_views bigint;
