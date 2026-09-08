# Supabase

Datastore migration in progress — see [`docs/supabase-migration-plan.md`](../docs/supabase-migration-plan.md).

## Provisioning (one-time)

```bash
vercel integration add supabase        # Free plan, connect all environments
vercel env pull .env.local --yes       # pulls SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
```

Then expose the client-side vars to Next.js (Marketplace injects the non-prefixed
names; the browser needs `NEXT_PUBLIC_`):

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL       # = SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY  # = SUPABASE_ANON_KEY
```

## Migrations

SQL under `migrations/`, applied with the Supabase CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

| File | Phase | Contents |
|---|---|---|
| `20260908120000_phase0_profiles_tasks.sql` | 0 | `profiles` + `tasks` tables, RLS, `updated_at` trigger, new-user → profile trigger, realtime publication for `tasks` |

## Phase 0 status

- [x] Migration: `profiles`, `tasks`
- [x] `packages/shared/src/supabase/` — client factory, `subscribeCollection` realtime helper, tasks module (`*Sb`)
- [ ] `vercel integration add supabase` (needs the account owner)
- [ ] `npx supabase db push`
- [ ] Web lab page exercising `subscribeTasksSb` + CRUD against the live project
- [ ] Validate realtime DX, then proceed to Phase 1
