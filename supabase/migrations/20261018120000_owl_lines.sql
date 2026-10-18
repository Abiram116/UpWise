-- Fewer AI calls, same freshness.
-- owl_lines: a bank of celebration lines, written a dozen at a time by one AI call and handed
-- out instantly on-device; refilled in the background when a kind runs low.
-- coach_cache: the last Today line per user and situation, so a second device (or a restart)
-- in the same situation reuses it instead of asking the model again.
create table if not exists public.owl_lines (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('done', 'goal', 'streak', 'cleared')),
  line text not null check (char_length(line) <= 120),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists owl_lines_unused on public.owl_lines (user_id, kind) where used_at is null;
alter table public.owl_lines enable row level security;
create policy "own owl lines" on public.owl_lines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.coach_cache (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  sig text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.coach_cache enable row level security;
create policy "own coach cache" on public.coach_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
