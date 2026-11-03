-- Content Canvas (v0.3 Part A): a board per piece of content. Its inputs (reference clips, a note, a link) and the
-- product go into one of a few fixed formats; every generated version is kept. Owner-only rows.

create table if not exists public.canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  title text not null default '',
  -- { "clips": [video ids, up to 6], "note": "", "link": null }
  inputs jsonb not null default '{"clips": [], "note": "", "link": null}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists canvases_user_idx on public.canvases (user_id, updated_at desc);
alter table public.canvases enable row level security;

create table if not exists public.canvas_outputs (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.canvases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  format text not null,
  -- The user's extra line for this generation (max 300 characters), and the refine chip it came from, if any.
  instructions text not null default '',
  refine text,
  content jsonb not null,
  source text not null default 'ai',
  vote smallint check (vote in (-1, 1)),
  created_at timestamptz not null default now()
);
create index if not exists canvas_outputs_canvas_idx on public.canvas_outputs (canvas_id, created_at desc);
create index if not exists canvas_outputs_user_day_idx on public.canvas_outputs (user_id, created_at);
alter table public.canvas_outputs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'canvases' and policyname = 'own canvases') then
    create policy "own canvases" on public.canvases for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'canvas_outputs' and policyname = 'own canvas outputs') then
    create policy "own canvas outputs" on public.canvas_outputs for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- "Save to Scripts" from a canvas: scripts keep one home, and remember the canvas they came from.
alter table public.scripts add column if not exists canvas_id uuid references public.canvases (id) on delete set null;
