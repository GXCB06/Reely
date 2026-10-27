-- Folders for saved clips ("hooks to try", "competitor apps"). A saved clip sits in at most one folder;
-- deleting a folder keeps its clips (they go back to "not in a folder").
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id, created_at);
alter table public.collections enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'collections' and policyname = 'own collections') then
    create policy "own collections" on public.collections for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

alter table public.saved_videos
  add column if not exists collection_id uuid references public.collections (id) on delete set null;
