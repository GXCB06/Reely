-- Reliable sending (v0.2 1.2) and the Ask Reely thread.

-- What happened when someone sent something (sent, failed, slow plan, saved, voted). Never the text they typed.
-- Users can only add their own rows; owners read them through the service role (account page).
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  request_id uuid,
  source text check (source is null or char_length(source) <= 40),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists client_events_created_idx on public.client_events (created_at desc);
alter table public.client_events enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_events' and policyname = 'insert own events') then
    create policy "insert own events" on public.client_events for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- Starting a research is idempotent: a retry with the same request id opens the research already started.
alter table public.research_runs add column if not exists request_id uuid;
create unique index if not exists research_runs_request_idx on public.research_runs (user_id, request_id) where request_id is not null;

-- "Ask Reely" turns under a research, so the thread survives a reload and later questions can refer to earlier
-- answers ("hook 2"). answer = the reply and the cards shown (clips, hooks, script id).
create table if not exists public.research_followups (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request_id uuid not null,
  question text not null check (char_length(question) <= 1000),
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index if not exists research_followups_run_idx on public.research_followups (run_id, created_at);
alter table public.research_followups enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'research_followups' and policyname = 'own followups') then
    create policy "own followups" on public.research_followups for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
