# Firebase → Supabase Migration Plan

**Status:** Phase 0 ✓ · Phase 1 in progress (schema landed, shared modules next)
**Driver:** stack preference (Postgres + Supabase). No hard blocker on Firebase today.
**Bottom line:** ~3–4 weeks of focused work for one dev. Two hard parts: rebuilding the
realtime layer, and the live data cutover. Everything else is mechanical.

---

## 1. Current Firebase footprint

| Piece | Detail | Migration weight |
|---|---|---|
| **Firestore** | `users/{uid}` doc + ~18 subcollections (see §3) | Heavy — the whole data layer |
| **Realtime** | ~22 `onSnapshot` `subscribe*` fns in `packages/shared` | Heavy — semantics differ |
| **Auth** | **Google OAuth only** — no email/password anywhere | Light — no password-hash migration |
| **firebase-admin** | Server sync services (`syncDevActivity`, `syncCalendar`, `syncStrava`, `syncSpotify`, `sendDailyDigests`) in `apps/web` + `apps/knowledge` | Medium |
| **Security rules** | `firestore.rules` | Medium — rewrite as RLS |
| Cloud Functions | **none** (`firebase.json` only configures Firestore) | — |
| Storage | **none** (no `firebase/storage` usage) | — |
| Push (FCM) | **none** — push is `web-push` (VAPID) + Expo Push API (`exp.host`), both provider-agnostic | — |

**Clients (all coupled via `@life-client/shared`):**
- `apps/web` — Next.js on Vercel (`life-client-web`)
- `apps/knowledge` — Next.js, separate Vercel deployment
- `apps/mobile` — Expo / EAS

**Write ops in use:** `deleteDoc` ×19, `updateDoc` ×17, `addDoc` ×15, `setDoc` ×5,
`serverTimestamp` ×18, `increment` ×3, `writeBatch` ×2, `getDoc(s)` ×4, `runTransaction` ×0.
Almost all simple per-document CRUD — no transactional complexity to port.

---

## 2. Target architecture

- **DB:** Supabase Postgres (provision via Vercel Marketplace → `vercel integration add supabase`).
- **Access:**
  - Browsers / mobile → `@supabase/supabase-js` with the anon key; RLS enforces per-user access.
  - Server (sync services, API routes) → service-role key, RLS bypassed.
- **Realtime:** Supabase Realtime (`postgres_changes`) for user-edited data; polling/refetch
  for sync-written data. One shared helper encapsulates the delta-merge + client-side sort.
- **Auth:** Supabase Auth, Google provider.
- **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` replace all
  `FIREBASE_*` / `NEXT_PUBLIC_FIREBASE_*` on both Vercel projects + EAS.
- **Migrations:** SQL files under `supabase/migrations/`, applied via the Supabase CLI.

---

## 3. Schema mapping

Every `users/{uid}/X` subcollection → a table with a `user_id uuid references auth.users`.
Nested/variant blobs (`recurrence`, `prMeta`, `prEvents`, `openPullRequests`) → `jsonb`
columns rather than child tables — they're read/written whole and never queried into.

| Firestore | Postgres table | Key | Notes |
|---|---|---|---|
| `users/{uid}` | `profiles` | `id = auth.users.id` | `display_name`, `email`, `photo_url`, `firebase_uid` (transition only) |
| `…/tasks/{id}` | `tasks` | `id text` (keep Firestore ID) | keeps deterministic sync IDs like `github_owner-repo_123` → re-sync stays idempotent. `recurrence`, `pr_meta`, `pr_events`, `tags text[]` |
| `…/goals/{id}` | `goals` | `id uuid` | |
| `…/challenges/{id}` | `challenges` | `id uuid` | |
| `…/sportActivities/{id}` | `sport_activities` | `id text` | keep Strava `externalId`-derived IDs |
| `…/integrations/{provider}` | `integrations` | `(user_id, provider)` | status / last_sync_at / last_error |
| `…/devActivity/{provider}` | `dev_activity` | `(user_id, provider)` | `open_pull_requests jsonb`, `total_merged_count` |
| `…/calendarEvents/{id}` | `calendar_events` | `id text` | keep Google event IDs |
| `…/spotify/{doc}` | `spotify_summary` | `user_id` | single row per user, mostly `jsonb` |
| `…/reminders/{id}` | `reminders` | `id uuid` | |
| `…/dailyLessons/{id}` | `daily_lessons` | `id text` (date-keyed) | server-written only |
| `…/codeDrills/{id}` | `code_drills` | `id uuid` | server-written only |
| `…/vocabWords/{id}` | `vocab_words` | `id uuid` | server creates; client updates mastery |
| `…/readingList/{id}` | `reading_list` | `id uuid` | |
| `…/transactions/{id}` | `transactions` | `id uuid` | |
| `…/budgets/{id}` | `budgets` | `id uuid` | |
| `…/viceLogs/{id}` | `vice_logs` | `id uuid` | |
| `…/manualProgress/{cid}` | `manual_progress` | `(user_id, characteristic_id)` | `count int` |
| `…/pushTokens/{id}` | `push_tokens` | `id text` | `platform`, `expo_push_token`, `web_subscription jsonb` |
| `oauthState/{token}` (top-level) | `oauth_state` | `token` | short-lived CSRF state; `pg_cron` sweep of rows older than 10 min |
| `integrationTokens/{doc}` (top-level) | `integration_tokens` | `(user_id, provider)` | **OAuth access/refresh tokens — encrypt at rest** (Supabase Vault / `pgsodium`). Firestore only guarded these with `allow: if false`. |

### RLS

```sql
-- per-user tables
create policy "own rows" on tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- repeat for every user-scoped table

-- server-only tables: no policy at all → anon/authenticated get nothing,
-- service-role bypasses RLS. Mirrors firestore.rules `allow write: if false`.
alter table integration_tokens enable row level security;
alter table oauth_state       enable row level security;
```

`daily_lessons`, `code_drills`, `spotify_summary`, `dev_activity`, `calendar_events` are
**read-own, write-none** (server writes them): `for select using (user_id = auth.uid())`, no
insert/update/delete policy.

---

## 4. Realtime strategy — the crux

Firestore `onSnapshot` gives a **live, ordered, filtered, paginated query result** with an
offline cache, for free. Supabase Realtime gives **row-level change events** on a table,
filtered by a single `col=eq.value`. The gap is closed in application code.

### Shared helper

Add `packages/shared/src/realtime.ts`:

```ts
// initial select + live channel; maintains a local array, applies INSERT/UPDATE/DELETE,
// re-runs `sort` and calls back. `filter` is the single server-side eq filter.
function subscribeCollection<T>({
  table, filterColumn, filterValue, order, map, onChange, onError,
}: SubscribeCollectionOptions<T>): () => void
```

Every existing `subscribeTasks`, `subscribeGoals`, … becomes a ~5-line wrapper over this,
keeping the **exact same signature** so app code (`apps/web`, `apps/mobile`, `apps/knowledge`)
is untouched.

### Per-collection policy

| Data | Approach | Why |
|---|---|---|
| `tasks`, `goals`, `reminders`, `transactions`, `budgets`, `vice_logs`, `challenges`, `sport_activities`, `manual_progress`, `vocab_words`, `reading_list` | **Realtime** channel | user edits these live; instant feedback matters |
| `integrations`, `dev_activity`, `spotify_summary`, `calendar_events`, `daily_lessons`, `code_drills` | **initial fetch + refetch** on focus / after an action / short poll | written by the sync cron every few hours — realtime is overkill |

Enable replication per realtime table: `alter publication supabase_realtime add table tasks;`
RLS is enforced on realtime too, so no data leaks.

### Known limitations to accept

- No compound server-side filter in a subscription (only `user_id = eq`). Ordering/limits/
  secondary filters run client-side after the initial ordered `select`.
- No offline cache. **Action item:** confirm whether `apps/mobile` depends on Firestore's
  offline persistence today; if so, add a small local cache (AsyncStorage/SQLite) or accept
  online-only.

---

## 5. Auth migration

Login is **Google-only** — no password hashes to migrate.

1. Enable Google provider in Supabase; register Supabase's callback
   (`https://<ref>.supabase.co/auth/v1/callback`) in Google Cloud Console alongside the
   existing entries. *(Same class of gotcha as the GitHub OAuth callback issue — get the
   redirect URI registered before testing.)*
2. **User pre-migration script:** Firebase Admin `listUsers()` → for each, Supabase Admin
   `createUser({ email, email_confirm: true, user_metadata: { full_name, avatar_url, firebase_uid } })`.
   Persist `firebase_uid ↔ supabase_uid` for the data migration's FK remap.
3. On first post-cutover login the user signs in with Google; Supabase matches by verified
   email → seamless, no re-registration.
4. **API-route auth:** rewrite `requireUid` (web + knowledge) to
   `supabase.auth.getUser(bearerToken)` → `data.user.id`. Client token source changes from
   `auth.currentUser.getIdToken()` to `supabase.auth.getSession()`.
5. Auth contexts (`apps/*/src/lib/auth-context.tsx`) → `supabase.auth.onAuthStateChange`.

---

## 6. Server / admin layer

- Replace `apps/web/src/lib/server/admin.ts` + `apps/knowledge/.../admin.ts` with a
  service-role Supabase client (`createClient(url, SERVICE_ROLE_KEY, { auth: { persistSession: false }})`).
- `adminDb.collection(x).doc(y).set(data, { merge:true })` → `.from(x).upsert({ id: y, ...data })`.
- `adminDb.batch()` (2 call sites in `syncDevActivity`) → `.upsert([...])` array, or a
  Postgres function for the mixed insert/update + "mark gone as done" logic.
- `serverTimestamp()` → column `default now()` / explicit `new Date().toISOString()`.
- `increment(n)` (3 sites) → `.rpc('increment_x', …)` or `update … set c = c + n`.
- `FieldValue`/deep-merge semantics → `jsonb` column replaced wholesale (we already build
  full objects, e.g. `buildPrMeta`, so this is a non-issue).
- Push (`sendPush.ts`), digests, cron: only the token **read** changes
  (`.from('push_tokens').select()`); the `web-push` / Expo `exp.host` calls are unchanged.

---

## 7. Data migration

One-off script (`scripts/migrate-firestore-to-supabase.ts`), run against **staging first**:

1. Firebase Admin: iterate `users/*`, then each subcollection.
2. Transform: Firestore `Timestamp` → ISO `timestamptz`; nested maps → `jsonb`; doc ID
   strategy per §3 (keep deterministic, mint UUIDs otherwise); `uid` → `firebase_uid` →
   `supabase_uid` via the auth map.
3. Load: `supabase.from(table).insert(rows)` in batches, service-role.
4. **Verify:** row counts per table vs Firestore doc counts; spot-check a few users
   end-to-end; checksum key aggregates (task counts, XP totals).

`oauth_state` is transient — don't migrate it. `integration_tokens` **must** migrate (users
would otherwise have to reconnect every integration) — write them through the encryption path.

---

## 8. Cutover

**Recommended: short maintenance window** (small user base, one active cohort).

1. Announce a ~30–60 min window.
2. Freeze writes (deploy a maintenance flag or pause the cron + show a banner).
3. Run the migration script (prod).
4. Flip env vars on `life-client-web` + `apps/knowledge` Vercel projects; new EAS build /
   OTA update for mobile with Supabase config.
5. Deploy, smoke-test (login, task CRUD, a sync run, push).
6. Unfreeze.

Dual-write (write to both stores during a transition) is possible but is a lot of extra
code for little benefit at this scale — only worth it if the window is unacceptable.

**Rollback:** keep Firebase project fully intact and env vars saved. If cutover fails,
revert env vars + redeploy → back on Firestore (any writes made to Supabase in the window
are lost, hence the write freeze).

---

## 9. Phasing & estimate

| Phase | Work | Est. |
|---|---|---|
| **0 — Provision & spike** *(in progress)* | Supabase project via Vercel Marketplace; schema + RLS migrations; wire `@supabase/supabase-js`; build the realtime helper; port **tasks** end-to-end on web behind a flag; validate realtime DX | 2–3 d |
| **1 — Shared data layer** | Port all of `packages/shared` reads/writes/subscriptions; keep exported signatures identical | 5–7 d |
| **2 — Auth** | Supabase Auth in all 3 apps; `requireUid` rewrite; user pre-migration script + mapping | 3–4 d |
| **3 — Server** | sync services, push, digests, cron → service-role client | 2–3 d |
| **4 — Data migration + cutover** | migration script; staging dry runs; prod window; verify; monitor 48 h | 2–3 d + window |
| **5 — Decommission** | strip `firebase` / `firebase-admin` deps, `firestore.rules`, `FIREBASE_*` env; delete Firebase project after a 2-week safety hold | 1 d (later) |

**Total: ~15–20 working days.** Risk concentrated in Phase 1 (realtime parity) and Phase 4
(data correctness).

### Progress log

**Phase 0 — done.** `/lab/supabase-tasks` (anon session) confirmed the
`subscribeCollection` helper: initial load, live INSERT/UPDATE propagation across
tabs, RLS scoping. Realtime rebuild approach is validated.

**Phase 1 — in progress.**

- [x] `supabase/migrations/…_phase1_full_schema.sql` — every remaining collection:
  `goals`, `challenges`, `sport_activities`, `reminders`, `transactions`, `budgets`,
  `vice_logs`, `manual_progress`, `reading_list`, `vocab_words` (own-rows RLS);
  `integrations`, `dev_activity`, `calendar_events`, `spotify_summary`,
  `daily_lessons`, `code_drills` (read-own, server-written); `push_tokens`;
  `oauth_state` + `integration_tokens` (no policy — service-role only). Realtime
  publication for all client-subscribed tables. Re-runnable.
- [x] **Backend switch** — `packages/shared/src/data/`: `configureDataBackend({ provider,
  firestore | client })` once at startup, then `data.subscribeTasks(uid, cb)` etc.
  dispatch to Firestore or Supabase. Namespaced (`export * as data`) to coexist with
  the direct Firestore exports during the transition.
- [~] Port `packages/shared` domain modules → `*Sb` + facade:
  - [x] tasks, goals
  - [ ] sports, challenges, reminders, finance, vices, knowledge, integrations,
    devActivity, calendar, spotify, characteristics, pushTokens
- [ ] Rewrite app call sites: `subscribeX(db, uid, …)` → `data.subscribeX(uid, …)`
  (once enough domains are ported to convert a whole page at once)
- [ ] `integration_tokens` encryption-at-rest (pgsodium/Vault) — before cutover

<details><summary>Phase 0 detail</summary>

Landed in `feature/supabase-phase-0` / `feature/supabase-lab`:

- `supabase/migrations/20260908120000_phase0_profiles_tasks.sql` — `profiles` + `tasks`
  tables, RLS, `updated_at` + new-user→profile triggers, realtime publication for `tasks`.
- `packages/shared/src/supabase/` — `createSupabase{Browser,Service}Client`,
  `subscribeCollection` (the generic `onSnapshot` replacement), and a `tasks` module
  (`subscribeTasksSb`, `subscribeTaskSb`, `createTaskSb`, `updateTaskSb`, `setTaskStatusSb`,
  `deleteTaskSb`, `advanceTaskStatusSb`) mirroring the Firestore signatures.
- `@supabase/supabase-js` added to `@life-client/shared`; exported from the barrel.
- `NEXT_PUBLIC_DATA_BACKEND` flag documented in `apps/web/.env.example`.

Blocked on the account owner:

1. `vercel integration add supabase` (Free plan, all environments).
2. `vercel env pull` + add the `NEXT_PUBLIC_SUPABASE_*` copies.
3. `npx supabase link --project-ref <ref> && npx supabase db push`.

Then: a `/lab/supabase-tasks` web page wired to `subscribeTasksSb` + CRUD to watch
realtime work against the live project → sign-off → Phase 1.

</details>

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Realtime semantics gap (sort/filter/pagination now client-side) | Generic `subscribeCollection` helper; accept client-side sorting; the app's lists are all small (per-user) |
| Mobile offline dependence | **Verify first** whether the mobile app relies on Firestore offline persistence; add local cache or accept online-only |
| Live data migration correctness | Staging dry runs, row-count + checksum verification, write freeze during cutover |
| OAuth tokens (`integration_tokens`) now in Postgres | Encrypt at rest (Vault / `pgsodium`); no RLS policy → service-role only |
| Google OAuth callback not registered for Supabase | Register `https://<ref>.supabase.co/auth/v1/callback` in Google Cloud Console before testing |
| Coordinated env swap across 2 Vercel projects + EAS | Checklist; do web first, then knowledge, then mobile OTA |
| `@life-client/shared` is consumed by 3 apps | Keeping every `subscribe*`/CRUD signature identical means app code is nearly untouched; changes land in one package |

---

## 11. Open questions

- Mobile offline persistence — required, or acceptable to be online-only?
- Keep `apps/knowledge` on the same Supabase project (shared `auth.users`) or its own?
- Window vs. dual-write — is a 30–60 min maintenance window acceptable?
- Region for the Supabase project (match Vercel `iad1`).
