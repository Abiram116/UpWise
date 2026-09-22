-- UpWise v1 schema
create extension if not exists "pgcrypto";

-- ---------- enums ----------
create type public.item_status as enum ('inbox', 'queued', 'in_progress', 'completed', 'skipped');
create type public.item_source as enum ('youtube', 'instagram', 'article', 'other');

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  goal text not null default 'AI Engineer',
  interests text[] not null default '{}',
  daily_target_minutes int not null default 30,
  -- notification prefs: {enabled, quiet_start:"22:00", quiet_end:"08:00", max_per_day:2, muted_categories:[]}
  settings jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- categories ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index categories_user_idx on public.categories(user_id);

-- ---------- items ----------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  canonical_url text not null,
  source public.item_source not null default 'other',
  external_id text,
  title text,
  description text,
  channel text,
  thumbnail_url text,
  duration_seconds int,
  transcript text,
  has_transcript boolean not null default false,
  category_id uuid references public.categories(id) on delete set null,
  tags text[] not null default '{}',
  status public.item_status not null default 'inbox',
  -- AI output: summary, key_concepts[], difficulty, prerequisites[], why_it_matters,
  -- takeaway, segments[{start,end,label}], resources[{title,url}], model, error
  ai jsonb not null default '{}'::jsonb,
  relevance_score smallint check (relevance_score between 1 and 5),
  estimated_minutes int,
  notes text,
  added_via text not null default 'paste',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (user_id, canonical_url)
);
create index items_user_status_idx on public.items(user_id, status);
create index items_user_created_idx on public.items(user_id, created_at desc);
create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- ---------- learning sessions ----------
create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds int not null default 0,
  created_at timestamptz not null default now()
);
create index sessions_user_started_idx on public.learning_sessions(user_id, started_at desc);

-- ---------- notifications log ----------
create table public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  kind text not null default 'nudge',
  title text not null,
  body text not null,
  scheduled_for timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index notif_user_idx on public.notifications_log(user_id, created_at desc);

-- ---------- daily activity view (stats) ----------
create or replace view public.daily_activity with (security_invoker = true) as
with days as (
  select user_id, (started_at at time zone 'UTC')::date as day, sum(seconds) as seconds
  from public.learning_sessions group by 1, 2
),
completed as (
  select user_id, (completed_at at time zone 'UTC')::date as day, count(*) as completed
  from public.items where completed_at is not null group by 1, 2
),
added as (
  select user_id, (created_at at time zone 'UTC')::date as day, count(*) as added
  from public.items group by 1, 2
)
select
  coalesce(d.user_id, c.user_id, a.user_id) as user_id,
  coalesce(d.day, c.day, a.day) as day,
  coalesce(d.seconds, 0) as seconds,
  coalesce(c.completed, 0) as completed,
  coalesce(a.added, 0) as added
from days d
full join completed c on c.user_id = d.user_id and c.day = d.day
full join added a on a.user_id = coalesce(d.user_id, c.user_id) and a.day = coalesce(d.day, c.day);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.notifications_log enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.learning_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifications" on public.notifications_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
