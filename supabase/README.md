# Supabase

Datastore migration in progress — see [`docs/supabase-migration-plan.md`](../docs/supabase-migration-plan.md).

## Provisioning

The Supabase Vercel integration is connected; it sets `NEXT_SUPABASE_URL` and
`NEXT_SUPABASE_PUBLISHABLE_KEY` (Production). `apps/web/next.config.ts` aliases
those to `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the
browser client.

Still needed later (Phase 3 + data migration): the **service-role / secret key**
(`SUPABASE_SERVICE_ROLE_KEY`) — copy from the Supabase dashboard → Project
Settings → API.

For local dev: `vercel env pull .env.local --environment=production`, or paste the
two `NEXT_SUPABASE_*` values into `.env.local`.

## Migrations

SQL under `migrations/`. Apply either via the Supabase **dashboard SQL editor**
(paste the file) or the CLI:

```bash
npx supabase login
npx supabase link --project-ref <ref>   # ref = the subdomain in NEXT_SUPABASE_URL
npx supabase db push
```

| File | Phase | Contents |
|---|---|---|
| `20260908120000_phase0_profiles_tasks.sql` | 0 | `profiles` + `tasks` tables, RLS, `updated_at` trigger, new-user → profile trigger, realtime publication for `tasks` |
| `20260908130000_phase1_full_schema.sql` | 1 | the remaining 14 tables, RLS, server-only tables, `oauth_state` cleanup cron |
| `20260908140000_phase1_fixes_and_functions.sql` | 1 | fixes and database functions |
| `20261110120000_phase2_archive_and_realtime_fixes.sql` | 2 | `tasks.archived`/`completed_at`, `replica identity full` on the 9 user-deletable tables, composite PK on `push_tokens` |

## Applied state

All four migrations were applied to **LifeClient** (`asdcvunofndmetrhcazs`,
production) on 2026-11-11 via `supabase db push`. Before that push the
migration history table was empty — phases 0 and 1 had never been applied
either, despite the checklist below having been written as though phase 0 were
mid-flight. Confirmed afterwards with `supabase migration list --remote`:
local and remote agree on all four.

Nothing in these migrations is destructive — no `drop table`, no truncate, no
`delete` outside the 15-minute `oauth_state` cleanup cron — so the push was
additive against what turned out to be an empty public schema.

## Phase 0 status

- [x] Migration written: `profiles`, `tasks`
- [x] `packages/shared/src/supabase/` — client factory, `subscribeCollection` realtime helper, tasks module (`*Sb`)
- [x] Supabase integration connected (`NEXT_SUPABASE_*` env vars)
- [x] `apps/web` client (`lib/supabase.ts`) + `/lab/supabase-tasks` page
- [x] **Apply the migration** — done 2026-11-11, along with phases 1 and 2
- [ ] **Enable Anonymous sign-ins** — Supabase → Authentication → Providers → Anonymous (the lab page uses an anon session). Dashboard-only; the CLI cannot set it.
- [ ] Open `/lab/supabase-tasks` in two tabs, confirm realtime propagates. Note `/lab` is gated behind `ENABLE_LAB_ROUTES=1` and 404s without it.
- [ ] Sign off → Phase 1

## Still blocking a real cutover

Applying the schema does not make this backend live. Tracked on #35:

- No server-side writer is ported — all of `apps/web/src/lib/server/*` talks to
  firebase-admin, so these tables stay empty until that work happens.
- `SUPABASE_SERVICE_ROLE_KEY` is still not set.
- No data has been migrated out of Firestore.
