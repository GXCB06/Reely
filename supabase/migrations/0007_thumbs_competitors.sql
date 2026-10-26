-- Covers copied to our own storage (vendor links expire), and competitors per product.

-- Public bucket for video covers; written only by the service role.
insert into storage.buckets (id, name, public) values ('thumbs', 'thumbs', true)
on conflict (id) do update set public = true;

alter table public.products add column if not exists competitors text[];
