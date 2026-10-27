-- The 7-day content plan per product (one current plan; making a new one replaces it).
-- items = [{ day, videoId, title, hook, format, why }], built by AI from the product's 👍, saved and best clips.
create table if not exists public.content_plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  start_day date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.content_plans enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_plans' and policyname = 'own plans') then
    create policy "own plans" on public.content_plans for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
