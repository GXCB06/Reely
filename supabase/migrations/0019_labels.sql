-- Human-labelled test set: while the owner labels the queue (/app/eval/label), about every 20th clip comes back
-- unmarked. The second answer is kept here, apart from the label itself, to measure how consistent the labels are.
alter table public.relevance_labels add column if not exists repeat_label smallint check (repeat_label between 0 and 2);
alter table public.relevance_labels add column if not exists repeat_at timestamptz;
