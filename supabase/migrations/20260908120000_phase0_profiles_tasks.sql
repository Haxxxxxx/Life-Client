-- Phase 0 of the Firebase → Supabase migration: enough schema to run the Tasks
-- feature end-to-end on Supabase behind a flag and validate the realtime rebuild.
-- See docs/supabase-migration-plan.md.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles  (mirrors the users/{uid} doc)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  photo_url    text,
  firebase_uid text unique,          -- transition-only: maps legacy Firestore uid
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update using (id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert with check (id = auth.uid());

-- auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, photo_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tasks  (mirrors users/{uid}/tasks/{id})
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  -- keep the Firestore doc id (deterministic for synced PRs, e.g.
  -- "github_owner-repo_123") so re-syncs stay idempotent.
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'   check (status in ('todo','in_progress','done')),
  priority    text not null default 'medium' check (priority in ('low','medium','high')),
  difficulty  text not null default 'medium' check (difficulty in ('easy','medium','hard','harder','hardest')),
  category    text not null,
  due_date    date,
  source      text not null default 'manual',
  source_ref  text,
  source_url  text,
  tags        text[] not null default '{}',
  goal_id     uuid,
  recurrence  jsonb,
  vice_log_id uuid,
  pr_meta     jsonb,
  pr_events   jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_id_created_at_idx on public.tasks (user_id, created_at desc);
create index if not exists tasks_user_id_source_idx     on public.tasks (user_id, source);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "tasks: own rows" on public.tasks
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- realtime: stream row changes for the subscribeTasks() rebuild
alter publication supabase_realtime add table public.tasks;
