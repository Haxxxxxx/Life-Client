-- Phase 1 of the Firebase → Supabase migration: schema for every remaining
-- Firestore collection. See docs/supabase-migration-plan.md §3.
-- profiles + tasks were created in the Phase 0 migration.
-- Written to be safely re-runnable.

-- ---------------------------------------------------------------------------
-- conventions
--   * one table per Firestore subcollection, `user_id uuid` FK to auth.users
--   * variant/nested blobs (recurrence, jsonb summaries) → jsonb columns
--   * "own rows" RLS everywhere a client touches data
--   * server-written data (sync output, generated lessons) → read-own, no write
--     policy; the service-role key bypasses RLS for the sync services
--   * user-edited tables are added to the supabase_realtime publication
-- ---------------------------------------------------------------------------

-- generic updated_at trigger fn already exists from Phase 0 (public.set_updated_at)

-- helper: attach the updated_at trigger idempotently
create or replace function public._attach_updated_at(tbl regclass)
returns void language plpgsql as $$
declare trg text := replace(tbl::text, 'public.', '') || '_set_updated_at';
begin
  execute format('drop trigger if exists %I on %s', trg, tbl);
  execute format('create trigger %I before update on %s for each row execute function public.set_updated_at()', trg, tbl);
end;
$$;

-- =========================================================================
-- goals
-- =========================================================================
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  target_date date,
  status      text not null default 'active' check (status in ('active','completed','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists goals_user_created_idx on public.goals (user_id, created_at desc);
select public._attach_updated_at('public.goals');
alter table public.goals enable row level security;
drop policy if exists "goals: own rows" on public.goals;
create policy "goals: own rows" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- challenges
-- =========================================================================
create table if not exists public.challenges (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  exercise_type text not null,
  metric        text not null check (metric in ('reps','distanceMeters','sessions')),
  daily_target  numeric not null,
  duration_days integer not null,
  start_date    date not null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists challenges_user_created_idx on public.challenges (user_id, created_at desc);
alter table public.challenges enable row level security;
drop policy if exists "challenges: own rows" on public.challenges;
create policy "challenges: own rows" on public.challenges for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- sport_activities  (Strava-synced + manually logged)
-- =========================================================================
create table if not exists public.sport_activities (
  id                    text primary key,   -- keep Strava/derived ids
  user_id               uuid not null references auth.users(id) on delete cascade,
  provider              text not null check (provider in ('strava','manual')),
  kind                  text not null check (kind in ('endurance','strength')),
  external_id           text,
  type                  text not null,
  name                  text not null,
  start_date            timestamptz not null,
  distance_meters       numeric,
  moving_time_sec       numeric,
  elevation_gain_meters numeric,
  avg_heart_rate        numeric,
  avg_pace_sec_per_km   numeric,
  reps                  numeric,
  sets                  numeric,
  weight_kg             numeric,
  external_url          text,
  created_at            timestamptz not null default now()
);
create index if not exists sport_activities_user_start_idx on public.sport_activities (user_id, start_date desc);
alter table public.sport_activities enable row level security;
drop policy if exists "sport_activities: own rows" on public.sport_activities;
create policy "sport_activities: own rows" on public.sport_activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- reminders
-- =========================================================================
create table if not exists public.reminders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  note              text,
  deadline          timestamptz not null,
  calendar_event_id text,           -- set by the server once mirrored to Google Calendar
  recurrence        jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists reminders_user_deadline_idx on public.reminders (user_id, deadline);
select public._attach_updated_at('public.reminders');
alter table public.reminders enable row level security;
drop policy if exists "reminders: own rows" on public.reminders;
create policy "reminders: own rows" on public.reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- transactions
-- =========================================================================
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null check (type in ('expense','income')),
  amount     numeric not null,
  category   text not null,
  note       text,
  date       date not null,
  recurrence jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
alter table public.transactions enable row level security;
drop policy if exists "transactions: own rows" on public.transactions;
create policy "transactions: own rows" on public.transactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- budgets
-- =========================================================================
create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null,
  monthly_limit numeric not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists budgets_user_category_idx on public.budgets (user_id, category);
alter table public.budgets enable row level security;
drop policy if exists "budgets: own rows" on public.budgets;
create policy "budgets: own rows" on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- vice_logs
-- =========================================================================
create table if not exists public.vice_logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  vice_id              text not null,
  penalty_stat         text not null,
  penalty_xp           integer not null,
  compensating_task_id text,
  compensated          boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists vice_logs_user_created_idx on public.vice_logs (user_id, created_at desc);
alter table public.vice_logs enable row level security;
drop policy if exists "vice_logs: own rows" on public.vice_logs;
create policy "vice_logs: own rows" on public.vice_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- manual_progress  (per-characteristic "+1 session" counters)
-- =========================================================================
create table if not exists public.manual_progress (
  user_id               uuid not null references auth.users(id) on delete cascade,
  characteristic_id     text not null,
  session_count         integer not null default 0,
  xp                    integer not null default 0,
  last_event_type       text,
  last_duration_minutes integer,
  last_people_count     integer,
  last_note             text,
  updated_at            timestamptz not null default now(),
  primary key (user_id, characteristic_id)
);
select public._attach_updated_at('public.manual_progress');
alter table public.manual_progress enable row level security;
drop policy if exists "manual_progress: own rows" on public.manual_progress;
create policy "manual_progress: own rows" on public.manual_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- reading_list  (client adds a url + can mark read/delete; server fills summary)
-- =========================================================================
create table if not exists public.reading_list (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  title         text,
  summary       text,
  key_takeaways text[],
  status        text not null default 'pending' check (status in ('pending','summarized','read','error')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists reading_list_user_created_idx on public.reading_list (user_id, created_at desc);
select public._attach_updated_at('public.reading_list');
alter table public.reading_list enable row level security;
drop policy if exists "reading_list: own rows" on public.reading_list;
create policy "reading_list: own rows" on public.reading_list for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- vocab_words  (server creates; client only updates its mastery/practice)
-- =========================================================================
create table if not exists public.vocab_words (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  word               text not null,
  definition         text not null,
  example            text not null,
  mastery            text not null default 'new' check (mastery in ('new','learning','known')),
  practice_sentence  text,
  practice_correct   boolean,
  practice_feedback  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists vocab_words_user_created_idx on public.vocab_words (user_id, created_at desc);
select public._attach_updated_at('public.vocab_words');
alter table public.vocab_words enable row level security;
drop policy if exists "vocab_words: read own"   on public.vocab_words;
drop policy if exists "vocab_words: update own" on public.vocab_words;
create policy "vocab_words: read own"   on public.vocab_words for select using (user_id = auth.uid());
create policy "vocab_words: update own" on public.vocab_words for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- server-written, read-own tables
-- =========================================================================

create table if not exists public.integrations (
  user_id                uuid not null references auth.users(id) on delete cascade,
  provider               text not null,
  status                 text not null,
  external_account_label text,
  scopes                 text[],
  connected_at           timestamptz,
  last_sync_at           timestamptz,
  last_error             text,
  primary key (user_id, provider)
);
alter table public.integrations enable row level security;
drop policy if exists "integrations: read own" on public.integrations;
create policy "integrations: read own" on public.integrations for select using (user_id = auth.uid());

create table if not exists public.dev_activity (
  user_id            uuid not null references auth.users(id) on delete cascade,
  provider           text not null,
  open_pull_requests jsonb not null default '[]'::jsonb,
  total_merged_count integer not null default 0,
  last_sync_at       timestamptz,
  primary key (user_id, provider)
);
alter table public.dev_activity enable row level security;
drop policy if exists "dev_activity: read own" on public.dev_activity;
create policy "dev_activity: read own" on public.dev_activity for select using (user_id = auth.uid());

create table if not exists public.calendar_events (
  id       text primary key,     -- Google event id
  user_id  uuid not null references auth.users(id) on delete cascade,
  title    text not null,
  start_ts timestamptz not null,
  end_ts   timestamptz not null,
  location text,
  url      text
);
create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, start_ts);
alter table public.calendar_events enable row level security;
drop policy if exists "calendar_events: read own" on public.calendar_events;
create policy "calendar_events: read own" on public.calendar_events for select using (user_id = auth.uid());

create table if not exists public.spotify_summary (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  recent_tracks        jsonb not null default '[]'::jsonb,
  top_artists          jsonb not null default '[]'::jsonb,
  total_minutes_recent integer not null default 0,
  last_sync_at         timestamptz
);
alter table public.spotify_summary enable row level security;
drop policy if exists "spotify_summary: read own" on public.spotify_summary;
create policy "spotify_summary: read own" on public.spotify_summary for select using (user_id = auth.uid());

create table if not exists public.daily_lessons (
  id                 text primary key,     -- ISO date YYYY-MM-DD ... prefixed per user below
  user_id            uuid not null references auth.users(id) on delete cascade,
  code_concept       text not null,
  code_explanation   text not null,
  word               text not null,
  word_language      text not null check (word_language in ('en','fr')),
  word_definition    text not null,
  word_example       text not null,
  article_topic      text not null,
  article_reason     text not null,
  article_source     text,
  article_url        text,
  created_at         timestamptz not null default now()
);
create index if not exists daily_lessons_user_created_idx on public.daily_lessons (user_id, created_at desc);
alter table public.daily_lessons enable row level security;
drop policy if exists "daily_lessons: read own" on public.daily_lessons;
create policy "daily_lessons: read own" on public.daily_lessons for select using (user_id = auth.uid());

create table if not exists public.code_drills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic       text not null,
  difficulty  text not null check (difficulty in ('beginner','intermediate','advanced')),
  prompt      text not null,
  explanation text not null,
  user_answer text,
  graded      boolean,
  score       integer,
  correct     boolean,
  feedback    text,
  hint        text,
  video_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists code_drills_user_created_idx on public.code_drills (user_id, created_at desc);
alter table public.code_drills enable row level security;
drop policy if exists "code_drills: read own" on public.code_drills;
create policy "code_drills: read own" on public.code_drills for select using (user_id = auth.uid());

-- =========================================================================
-- push_tokens  (server reads to send push; client registers its own token)
-- =========================================================================
create table if not exists public.push_tokens (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  platform        text not null check (platform in ('expo','web')),
  expo_push_token text,
  web_subscription jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "push_tokens: own rows" on public.push_tokens;
create policy "push_tokens: own rows" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- server-only tables (no RLS policy → clients get nothing; service-role only)
-- =========================================================================

create table if not exists public.oauth_state (
  token      text primary key,
  uid        text not null,
  provider   text not null,
  return_to  text,
  created_at timestamptz not null default now()
);
alter table public.oauth_state enable row level security;

-- NOTE: OAuth access/refresh tokens. Firestore guarded these with `allow: if false`
-- only (plaintext at rest). Same here for now; encrypt-at-rest (pgsodium / Vault)
-- is a tracked follow-up before cutover — see the migration plan risk table.
create table if not exists public.integration_tokens (
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  access_token  text not null,
  refresh_token text,
  expires_at    bigint,
  scope         text,
  primary key (user_id, provider)
);
alter table public.integration_tokens enable row level security;

-- sweep expired short-lived CSRF state (needs pg_cron; harmless if the extension
-- isn't enabled — run manually or wire the existing cron to DELETE on sync)
-- select cron.schedule('oauth_state_gc', '*/10 * * * *',
--   $$delete from public.oauth_state where created_at < now() - interval '15 minutes'$$);

-- =========================================================================
-- realtime: user-edited + client-subscribed tables
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'goals','challenges','sport_activities','reminders','transactions','budgets',
    'vice_logs','manual_progress','reading_list','vocab_words',
    'integrations','dev_activity','calendar_events','spotify_summary','daily_lessons','code_drills'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

drop function if exists public._attach_updated_at(regclass);
