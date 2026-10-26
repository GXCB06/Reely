-- English version of each keyword (Instagram's popular search only understands English).
alter table public.research_runs add column if not exists keyword_english text[];
