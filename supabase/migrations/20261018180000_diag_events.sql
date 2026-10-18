-- On-device diagnostics: layout anomalies and slow frames, numbers only (no content), so bugs
-- that only happen on the phone can be seen. Capped per device per day by the app.
create table if not exists public.diag_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  data jsonb not null,
  app_version text,
  created_at timestamptz not null default now()
);
create index if not exists diag_events_recent on public.diag_events (created_at desc);
alter table public.diag_events enable row level security;
create policy "own diag" on public.diag_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
