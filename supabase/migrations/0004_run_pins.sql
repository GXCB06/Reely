-- Recent chats in the sidebar: pinned ones stay on top.
alter table public.research_runs add column if not exists pinned_at timestamptz;
