-- A clip's timed transcript (shared cache, like videos): read by signed-in users, written by the server.
-- status 'none' = the clip has no speech or captions, so it is never paid for twice.
-- breakdowns = the AI's hook and structure breakdown per locale ({ "th": {...}, "en": {...} }).
create table if not exists public.video_transcripts (
  video_id bigint primary key references public.videos (id) on delete cascade,
  status text not null check (status in ('ok', 'none')),
  language text,
  segments jsonb not null default '[]'::jsonb,
  breakdowns jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.video_transcripts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_transcripts' and policyname = 'read transcripts') then
    create policy "read transcripts" on public.video_transcripts for select to authenticated using (true);
  end if;
end $$;
