-- My channels (v0.3 Part B): a founder's own public accounts, up to 3 per product. Posts and stats live in the
-- shared videos / creators cache; this table only says which accounts are the user's, and keeps their AI audit.

create table if not exists public.own_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  platform text not null check (platform in ('tiktok', 'youtube', 'instagram')),
  handle text not null check (char_length(handle) between 1 and 100),
  added_at timestamptz not null default now(),
  -- The one deeper read (TikTok 4 pages, Instagram 3) made when the account was added.
  deep_read_at timestamptz,
  -- The latest "Analyse my channel" result (B2), kept until the next refresh.
  audit jsonb,
  audit_at timestamptz,
  unique (user_id, platform, handle)
);
create index if not exists own_accounts_product_idx on public.own_accounts (product_id);
alter table public.own_accounts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'own_accounts' and policyname = 'own channels') then
    create policy "own channels" on public.own_accounts for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;
