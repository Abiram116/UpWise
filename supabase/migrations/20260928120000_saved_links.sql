-- Plain website links are kept as bookmarks: status 'saved' — not something to learn, so they
-- stay out of the to-learn list, the backlog and the "saved per week" rate.
alter type public.item_status add value if not exists 'saved';

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
  from public.items where status::text <> 'saved' group by 1, 2
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
