-- v0.3 round 2: growth history for every creator Reely refreshes, post tags for My channels charts, and the
-- "Did it work?" link from a canvas version to the post the founder made from it.

-- One row per creator per day, written with every refresh (saveCreator). Shared cache like creators: read for
-- signed-in users, written only by the service role (no insert policy).
create table if not exists public.creator_snapshots (
  platform text not null,
  handle text not null,
  day date not null default current_date,
  followers bigint,
  usual_views bigint,
  posts_read int,
  primary key (platform, handle, day)
);
alter table public.creator_snapshots enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_snapshots' and policyname = 'read snapshots') then
    create policy "read snapshots" on public.creator_snapshots for select to authenticated using (true);
  end if;
end $$;

-- My channels: format and hook type per post (one AI call with "Analyse my channel"), kept until the next refresh.
alter table public.own_accounts add column if not exists post_tags jsonb;
alter table public.own_accounts add column if not exists post_tags_at timestamptz;

-- "Did it work?": the post a canvas version became, linked by the founder.
alter table public.canvas_outputs add column if not exists posted_video_id bigint references public.videos (id) on delete set null;
alter table public.canvas_outputs add column if not exists posted_at timestamptz;
