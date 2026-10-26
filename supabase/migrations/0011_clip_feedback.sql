-- 👍/👎 on a clip, per product: "useful for this product" or "not what I want". The next research for that product
-- uses them as examples in the relevance check, drops 👎 clips and nudges the ranking toward 👍 creators.
create table if not exists public.clip_feedback (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  video_id bigint not null references public.videos (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, video_id)
);
create index if not exists clip_feedback_product_idx on public.clip_feedback (product_id, updated_at desc);

alter table public.clip_feedback enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clip_feedback' and policyname = 'own feedback') then
    create policy "own feedback" on public.clip_feedback for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
