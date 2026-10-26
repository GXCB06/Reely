-- How easily a small business could film a similar clip with a phone (AI, from the caption, in the same call as the
-- relevance check): 2 easy (talking head, screen demo, simple skit), 1 needs some production, 0 can't be copied
-- (celebrity, TV or movie footage, re-uploads, big-budget ads). Null for results saved before this existed.
alter table public.run_results add column if not exists copyable smallint check (copyable between 0 and 2);
