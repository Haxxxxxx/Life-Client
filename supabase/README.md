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

## Phase 0 status

- [x] Migration written: `profiles`, `tasks`
- [x] `packages/shared/src/supabase/` — client factory, `subscribeCollection` realtime helper, tasks module (`*Sb`)
- [x] Supabase integration connected (`NEXT_SUPABASE_*` env vars)
- [x] `apps/web` client (`lib/supabase.ts`) + `/lab/supabase-tasks` page
- [ ] **Apply the migration** (dashboard SQL editor or `supabase db push`)
- [ ] **Enable Anonymous sign-ins** — Supabase → Authentication → Providers → Anonymous (the lab page uses an anon session)
- [ ] Open `/lab/supabase-tasks` in two tabs, confirm realtime propagates
- [ ] Sign off → Phase 1
