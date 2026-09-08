-- Phase 1 follow-up: composite primary keys + the log_vice transaction.
-- Safe on empty tables; re-runnable.

-- ---------------------------------------------------------------------------
-- Tables that keep an upstream/deterministic id (Firestore doc id, GitHub PR
-- key, Strava id, Google event id, lesson date) need it scoped per user — two
-- users can legitimately have the same id (same PR, same date). Make the PK
-- composite (user_id, id) so upsert-by-id stays idempotent per user.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'sport_activities', 'calendar_events'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pkey');
    execute format('alter table public.%I add primary key (user_id, id)', t);
  end loop;
end $$;

-- daily_lessons: id is the ISO date (unique per user, not globally)
alter table public.daily_lessons drop constraint if exists daily_lessons_pkey;
alter table public.daily_lessons add primary key (user_id, id);

-- ---------------------------------------------------------------------------
-- log_vice(): atomically record a vice slip + create its compensating task,
-- cross-linked. Replaces the Firestore writeBatch in vices.ts.
-- ---------------------------------------------------------------------------

create or replace function public.log_vice(
  p_vice_id      text,
  p_penalty_stat text,
  p_penalty_xp   integer,
  p_task_title   text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_log_id  uuid := gen_random_uuid();          -- vice_logs.id is uuid
  v_task_id text := gen_random_uuid()::text;     -- tasks.id is text
begin
  insert into public.tasks (id, user_id, title, status, priority, difficulty, category, source, tags, vice_log_id)
  values (v_task_id, auth.uid(), p_task_title, 'todo', 'medium', 'medium', 'health', 'manual', '{}', v_log_id);

  insert into public.vice_logs (id, user_id, vice_id, penalty_stat, penalty_xp, compensating_task_id, compensated)
  values (v_log_id, auth.uid(), p_vice_id, p_penalty_stat, p_penalty_xp, v_task_id, false);
end;
$$;
