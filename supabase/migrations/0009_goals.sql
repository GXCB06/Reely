-- What the user wants the clips for (sell = affiliate / TikTok Shop, shop = local business, startup = app or SaaS,
-- brand = personal brand). Remembered per product; each research keeps the goal it ran with.
alter table public.products add column if not exists goal text
  check (goal in ('sell', 'shop', 'startup', 'brand'));
alter table public.research_runs add column if not exists goal text
  check (goal in ('sell', 'shop', 'startup', 'brand'));
