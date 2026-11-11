-- Phase 2 — the schema half of the Supabase gap list (issue #35).
--
-- DRAFT: reviewed but NOT applied. Apply with `supabase db push` (or
-- `supabase migration up`) only after reading the backfill note on §1, which
-- is the one step that is not safely re-runnable by accident.
--
-- Everything here is idempotent: `if not exists`, `add column if not exists`,
-- and guarded DO blocks, so a partial run can be repeated.
--
-- Three problems, all found by diffing the Supabase layer against the Firestore
-- one module by module. None of them can be fixed in TypeScript.

-- ---------------------------------------------------------------------------
-- 1. tasks is missing `archived` and `completed_at`
-- ---------------------------------------------------------------------------
-- The Firestore Task carries both. Without them:
--   * archivedTasks() always returns [] -> the Archived section added in the
--     archive-view work is permanently empty on this backend, and
--     visibleTasks() returns everything, so auto-archived tasks reappear in the
--     main list. Those two helpers are documented as exact complements so that
--     nothing becomes unreachable; here the invariant inverts.
--   * the Restore button calls updateTask(uid, id, { archived: false }), which
--     would do nothing at all.
--   * taskCompletedIso() falls back to updated_at, and the set_updated_at
--     trigger bumps that on EVERY write — so completion charts re-date history
--     to whenever a task was last touched.

alter table public.tasks
  add column if not exists archived     boolean     not null default false,
  add column if not exists completed_at timestamptz;

-- Backfill note (important, and the reason this is a draft):
--
-- `default false` already backfills existing rows, so the `archived = false`
-- query the archive cron will eventually want is safe here. This is the step
-- that has no Firestore equivalent — Firestore equality does not match a
-- missing field, so the same narrowing there needs an explicit backfill first.
--
-- completed_at is deliberately left NULL for existing rows rather than guessed
-- from updated_at: inventing a completion date is worse than admitting we do
-- not have one, and taskCompletedIso already falls back.

-- Partial index: the archive sweep only ever looks for done-and-not-archived.
create index if not exists tasks_archive_sweep_idx
  on public.tasks (user_id, completed_at)
  where archived = false and status = 'done';

-- ---------------------------------------------------------------------------
-- 2. Realtime DELETE events never arrive for 9 of 16 tables
-- ---------------------------------------------------------------------------
-- With the default replica identity, Postgres puts ONLY the primary-key
-- columns into a DELETE's `old` record. The client subscribes with the filter
-- `user_id=eq.<uid>`, so for a table whose PK is `id` alone that filter cannot
-- match and Realtime drops the event (RLS cannot evaluate user_id on the
-- partial row either).
--
-- The affected set is exactly the user-deletable one: deleting a goal,
-- challenge, reminder, transaction, budget, vice log, reading item, vocab word
-- or drill returns success while the row STAYS ON SCREEN in every open
-- subscriber until the app remounts. Firestore's onSnapshot removes it at once.
--
-- `replica identity full` puts the whole old row into the WAL, which is what
-- makes the filter and RLS evaluable. It costs some WAL volume on delete-heavy
-- tables; at this scale that is not a concern.

do $$
declare t text;
begin
  foreach t in array array[
    'goals','challenges','reminders','transactions','budgets',
    'vice_logs','reading_list','vocab_words','code_drills'
  ] loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. push_tokens.id is a global primary key
-- ---------------------------------------------------------------------------
-- The id is a 32-bit FNV-1a hash of the device token/endpoint. Firestore scopes
-- it per user (users/{uid}/pushTokens/{id}), so a collision between two users
-- is structurally impossible. Here it is global: if two users' tokens hash to
-- the same value, the second user's upsert targets the FIRST user's row, the
-- `with check (user_id = auth.uid())` policy denies it, and registration fails
-- outright for that user.
--
-- 32 bits is small enough that this is a real birthday-problem risk, not a
-- theoretical one.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and contype = 'p'
      and array_length(conkey, 1) = 1
  ) then
    alter table public.push_tokens drop constraint push_tokens_pkey;
    alter table public.push_tokens add primary key (user_id, id);
  end if;
end $$;

-- Composite PK means user_id is in the old record, so DELETE events work here
-- without replica identity full.

-- ---------------------------------------------------------------------------
-- 4. push_tokens carries the device's timezone
-- ---------------------------------------------------------------------------
-- The daily digest asks "what is due today". Server-side that question has no
-- answer without the user's zone: the cron's own clock is UTC, so for everyone
-- outside Greenwich it was reading the wrong calendar day for part of every
-- day. The zone is recorded per device, refreshed on each registration, so it
-- follows the user when they travel; `seen_at` is what makes "most recently
-- used device" answerable, since created_at is deliberately preserved across
-- re-registrations.

alter table public.push_tokens add column if not exists time_zone text;
alter table public.push_tokens add column if not exists seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- Still open after this migration (code, not schema — tracked on #35)
-- ---------------------------------------------------------------------------
--   * No server-side writer is ported: all 11 apps/web/src/lib/server/* modules
--     talk to firebase-admin directly, so these tables would never be populated.
--     This is the largest remaining piece of the migration.
--   * subscribeCollection has no reconnect re-sync and races its own initial
--     select, so a dropped connection silently leaves lists stale.
--   * The initial select has no limit; confirm this project's `db-max-rows`
--     before cutover or long histories truncate silently.
--   * `numeric` columns may decode as strings over Realtime but as numbers over
--     REST. Verify empirically; if confirmed, prefer float8/integer here.
--   * Updates matching zero rows return success — the *Sb writers need
--     .select() plus an affected-row assertion.
