# Life Client — end-to-end review

**Date:** 2026-11-10 · **Commit:** `718f8cf` · **Scope:** `apps/web`, `apps/knowledge`, `apps/mobile`, `packages/shared`, `firestore.rules`, `supabase/`

Four parallel reviews (security, web, mobile, architecture). Every finding marked **[verified]**
below was confirmed by reading the cited source directly, not just reported.

## Build health

| Check | Result |
|---|---|
| `next build` — web | pass (24 routes) |
| `next build` — knowledge | pass (10 routes) |
| `eslint` — web / knowledge / mobile | clean, 0 findings |
| `tsc --noEmit` — mobile | **fails**, 5 errors (stale generated route types) |
| Tests | **none exist** (0 test files, no test script) |
| CI | **none** (no `.github/`) |
| `npm audit --omit=dev` | 36 vulns — 2 critical, 18 high |

Secret hygiene is clean: no `.env*`, service account, or key material has ever been committed
(`git log --all`), no server module is imported from any page or component, and no secret env
names appear in the built client chunks.

---

## Critical — fix before anything else

### C1. `/api/oauth/disconnect` is unauthenticated and takes `uid` from the query string [verified]
`apps/web/src/app/api/oauth/disconnect/route.ts:6-19` — there is no `requireUid`; `grep` confirms
`requireUid` appears nowhere in the `oauth/` directory.

```
GET /api/oauth/disconnect?provider=strava&uid=<any uid>
```

deletes that user's OAuth tokens and flips their status to disconnected. Loop the five providers
and you have killed every integration for any account whose uid you know. It is a `GET` with side
effects, so a bare `<img src=...>` on any page fires it — no victim interaction beyond a page load.

**Fix:** require `Authorization: Bearer <ID token>`, derive the uid from the verified token, and
ignore the query param entirely. Make it a `POST`.

### C2. `/api/oauth/start` accepts an unauthenticated `uid`; the callback has no session binding [verified]
`apps/web/src/app/api/oauth/start/route.ts:9` and `apps/web/src/app/api/oauth/callback/route.ts:17-33`.

The state token is good in itself — 24 random bytes, single-use, 10-minute expiry — but it is the
*only* thing the callback trusts. There is no cookie, no session check, nothing tying the flow to
a browser.

Attack: call `/api/oauth/start?provider=google&uid=<victim uid>`, authorize with **your own**
Google account, and let the callback land. Your tokens are now stored under the victim's uid. Their
dashboard fills with your data — and worse, the reminder-mirroring path (`/api/reminders/sync`,
`/api/calendar/events`) now writes *their* reminder titles and notes into *your* calendar. That is
an outbound data leak, not just defacement.

**Fix:** authenticate `start` and take the uid from the token. Additionally bind the state to the
browser via an HttpOnly/SameSite=Lax/Secure cookie and compare it in the callback.

### C3. `CRON_SECRET` fails open [verified]
`apps/web/src/app/api/cron/sync/route.ts:12`:

```ts
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
```

If `CRON_SECRET` is unset in any environment — a preview deploy, a misconfigured production — the
expected value is the literal string `"Bearer undefined"`, which anyone can send. The route is
`maxDuration = 300` and fans out to every user across four providers plus push digests, so this is
a cost and rate-limit amplifier as well as an authz hole.

**Fix:** fail closed when the secret is absent or short, and compare with `crypto.timingSafeEqual`
over SHA-256 digests.

### C4. Open redirect in both OAuth routes [verified]
`callback/route.ts:54` and `disconnect/route.ts:19` build `` `${origin}${returnTo}` `` from an
unvalidated query param. `returnTo=@evil.com` yields `https://app.example@evil.com`, which browsers
resolve to `evil.com`. Reachable on `disconnect` with no auth and no OAuth round-trip at all.

**Fix:** `const u = new URL(returnTo, origin); if (u.origin !== origin) reject;`

---

## High

### H1. The GitHub/GitLab sync permanently marks live PRs as done [verified]
`apps/web/src/lib/server/syncDevActivity.ts:389-398`:

```ts
if (!res.ok) return { state: "closed", resolvedAt: null };
...
return pr.merged ? { state: "merged", ... } : { state: "closed", ... };
```

`resolveGithubOutcome` **never reads `pr.state`**. Anything not merged is "closed". Three ways a
still-open PR gets closed out:

1. It falls outside the fetch caps (`search first: 50`, 100 repos × 30 PRs, GitLab `per_page=50`
   with no paging — all at `:65,77,83,296`), so it looks like it "left the open set".
2. A transient non-OK response — a 403 rate-limit, a 502 — returns `closed` directly.
3. The `.catch(() => ({ state: "closed" }))` at `:490` turns any network error into a close.

The task is then written `status: "done"` with `prMeta.state = "closed"`, and the `alreadyResolved`
guard at `:480` means it can **never** be reconciled back. One GitHub rate-limit burst silently and
permanently marks your open PRs complete, and grants completion XP for them.

**Fix:** return `"open"` when `pr.state === "open"` and skip the update. On non-OK, skip rather
than close. Paginate. Add a reopen path for resolved tasks whose PR reappears.

### H2. `createdAt` is written as two different types into one ordered collection [verified]
`packages/shared/src/tasks.ts:55` writes `serverTimestamp()` (a Firestore `Timestamp`);
`syncDevActivity.ts:545` writes `nowIso` (a string). Both land in `users/{uid}/tasks`, which is read
with `orderBy("createdAt", "desc")` (`tasks.ts:27`). Firestore sorts by type first, so synced and
hand-created tasks form two blocks that never interleave — the task list order is simply wrong. The
`as Task` cast hides it from the compiler. `challenges.ts:43` uses a third convention.

**Fix:** pick one representation for every writer and normalize on read. Drop the cast.

### H3. No rate limiting or input caps on the AI endpoints [verified]
`apps/knowledge/src/app/api/knowledge/drill/route.ts:22-33` — `topic` goes from request body
straight into the prompt with no length cap. Same for `sentence` (vocab/grade) and `answer`
(drill/grade). Auth is correctly enforced on all seven routes, but any signed-in Google account can
loop these indefinitely; each call is a paid LLM call plus a Firestore write.

This compounds with a dependency bug: `zod@4.4.3` is installed and the advisory
`GHSA-mrhx-c7xc-m3w5` (memory exhaustion on oversized constrained collections) covers `<4.6.6`.
Unbounded user input feeding zod-validated structured output is the exact shape of that advisory.

**Fix:** per-uid daily quota, hard length caps (topic ≤ 200, sentence ≤ 500, answer ≤ 4000),
`maxOutputTokens`, and bump zod.

### H4. One user's failure aborts the entire cron sweep [verified]
`apps/web/src/lib/server/syncStrava.ts:37` — `getTokens` sits **outside** the `try` that starts at
`:40`. `syncAllStrava` (`:88`) is a bare `Promise.all` over all users, as are the Calendar
(`syncCalendar.ts:74`) and Spotify (`syncSpotify.ts:135`) equivalents. A single Firestore read blip
for one user rejects the whole provider sweep for everyone. Only `sendDailyDigests` uses
`allSettled`.

Related: the cron returns HTTP 200 with `{ ok: true, failures: n }` even when providers fail, so
Vercel's alerting sees success.

**Fix:** `Promise.allSettled` with a concurrency cap; move `getTokens` inside the try; return
non-200 when `failures > 0`.

### H5. SSRF filter in `/api/knowledge/summarize` is bypassable
`summarize/route.ts:19-33` filters on hostname regex only. It misses DNS rebinding
(`127.0.0.1.nip.io`), decimal/hex IPs, IPv6 (`[::ffff:127.0.0.1]`), and — most simply — **redirects**,
since `fetch` follows them by default. `response.text()` also reads the whole body before slicing
to 8000 chars. The input is fully user-controlled: `readingList.url` is client-writable under the
Firestore rules.

**Fix:** `redirect: "manual"` with per-hop revalidation, DNS resolution with private/loopback/
link-local/ULA rejection, and a streaming byte cap.

### H6. Push tokens are never unregistered on sign-out [verified]
`apps/mobile/src/lib/auth-context.tsx:52-56` — `signOutUser` calls `signOut` and
`GoogleSignin.signOut` and nothing else; `grep` finds no `unregisterPushToken` anywhere in mobile.
Sign out, hand the phone to someone else, and the previous user's notifications keep arriving.

Also in that function: `signOut(auth)` runs before `GoogleSignin.signOut()`, and the only caller
(`profile.tsx:349`) is a bare `onPress={() => signOutUser()}` with no catch — an unhandled rejection.

---

## Medium

### M1. The Supabase backend cannot work, and nothing prevents switching to it [verified]
This is latent — `NEXT_PUBLIC_DATA_BACKEND=firebase` today — but it is a loaded gun.

- Every table declares `user_id uuid not null references auth.users(id)`
  (`supabase/migrations/20260908130000_phase1_full_schema.sql:33` and throughout).
- Every client passes `user.uid` — a 28-character Firebase uid — into `.eq("user_id", uid)`.
  Postgres rejects it as an invalid uuid.
- There is **no identity bridge**. The only `supabase.auth` call in the entire repo is
  `signInAnonymously` on the lab page (`apps/web/src/app/lab/supabase-tasks/page.tsx:37`).
  `grep` for `signInWithIdToken` returns nothing, so RLS (`user_id = auth.uid()`) has no session.
- The **entire server layer is Firestore-only** — all 11 modules in `apps/web/src/lib/server/` use
  `adminDb`, and `createSupabaseServiceClient` is never called. Even a working client flip would
  show empty sports, calendar, dev activity, Spotify and lessons, because sync writes elsewhere.
- The three apps choose backends independently (web by env, knowledge and mobile hardcoded), with
  no cross-app guard and no per-user migrated marker.

**Fix, in order:** decide the identity bridge first — Supabase Auth + Google with a uid remap, or
Firebase JWT as a third-party provider (which requires `user_id` to become `text` on every table, so
decide *before* writing more SQL). Make backend selection fail closed and single-sourced in
`packages/shared`. Then build a server-side store seam, Firestore-backed first.

### M2. Dashboard and mobile mutations swallow rejections
`apps/web/src/app/(app)/dashboard/page.tsx:120-141` (`bulkMarkDone`, `bulkDelete`,
`clearCompleted`) and the inline `db && data.x()` handlers are floating promises; `RenameField.onSave`
is typed `=> void`. `Promise.all` fails fast while the other writes continue, so state ends up
partially applied and `setSelected(new Set())` is skipped. Mobile has the same pattern at
`index.tsx:136-157` and `sports.tsx:745`.

`dashboard/page.tsx:434` — clearing the `datetime-local` deadline makes `new Date("").toISOString()`
throw a `RangeError` inside the click handler.

### M3. Recurring-reminder delete is non-atomic on both clients
`dashboard/page.tsx:490-503` and `mobile/src/app/index.tsx:565-575` create the next occurrence
*before* deleting the current one. If the delete fails you keep both, and retrying creates a third.
The web path also skips `syncReminderToCalendar` for the new occurrence, which `handleAdd` does call.

### M4. Sync pagination silently truncates
Strava `per_page=30` with no cursor (`syncStrava.ts:43`), Calendar `maxResults=20` over a 7-day
window with no `nextPageToken` (`syncCalendar.ts:34`), Spotify `limit=20` (`syncSpotify.ts:103`),
GitLab `per_page=50` (`syncDevActivity.ts:296`) — all verified. A first sync loses history; a busy
week between daily runs loses activities. `totalMinutesRecent` only ever covers the last 20 plays.

Calendar sync also only upserts (`syncCalendar.ts:42-57`) — cancelled and moved events never
disappear.

### M5. Daily digest evaluates "today" in the server's timezone
`sendDailyDigests.ts:15-19,32` uses server-local time, which is UTC on Vercel, for every user. The
cron fires at `0 6 * * *` UTC (`vercel.json`), so "due today" is wrong for anyone far from UTC. It
also does a full `collectionGroup("pushTokens").get()` scan.

### M6. Zero keyboard handling in the mobile app [verified]
`grep` for `KeyboardAvoiding|keyboardShouldPersistTaps|automaticallyAdjustKeyboardInsets` across
`apps/mobile/src` returns **0 matches**. Every form screen (tasks, goals, money, sports, agenda,
knowledge, profile) can have its inputs covered by the keyboard, and because
`keyboardShouldPersistTaps` is unset, submitting takes two taps — the first only dismisses the
keyboard.

### M7. Notifications are registered but never handled [verified]
`grep` finds no `setNotificationHandler`, no `addNotificationResponseReceivedListener`, and no
`addPushTokenListener` in mobile. Consequences: foreground notifications are silent, tapping a
notification does nothing, and a refreshed push token is only picked up on the next cold start.

Combined with the auth gating in `_layout.tsx` being conditional rendering rather than routing
(`<Gate>` returns `<AppTabs/>` or `<LoginScreen/>`, with no `Stack`), deep links to a signed-out
user are dropped rather than resumed after login, and Android back exits the app from any tab.

### M8. Duplicate always-on subscriptions across screens
Web dashboard opens 13 listeners (`dashboard/page.tsx:631-649`), mobile `index.tsx:734-749` opens 13,
`profile.tsx:235-250` opens 12, `knowledge.tsx:761-768` opens 4. The same collections are subscribed
from several screens at once, and expo-router keeps tabs mounted, so hidden screens keep streaming.
Every effect keys on `[user]` (the object) rather than `[user?.uid]`, so a token refresh can tear
down and rebuild all of them.

Cleanup itself is correct everywhere — every `data.subscribe*` effect returns its unsubscribe, and
the multi-listener effects collect and call them. **No leaked listeners were found.**

### M9. Error detail is persisted into a client-readable doc
`callback/route.ts:48-52` writes `lastError: error.message` to `users/{uid}/integrations/{provider}`,
which the owning client can read. `providers.ts:126,133` builds that message by `JSON.stringify`-ing
the raw provider token response — reached precisely when `access_token` is missing, so a partial
response containing a refresh token could land there.

---

## Low

- **`server-only` is not used** [verified]. `apps/*/src/lib/server/*` is protected by convention
  alone. Today the boundary holds — no page or component imports it, and no secret env names appear
  in the built chunks — but after a Supabase server port the service-role key is one bad import away.
  Add `import "server-only"` plus an ESLint `no-restricted-imports` rule.
- **Mobile typecheck is red** [verified]. `.expo/types/router.d.ts` is dated Aug 25 and predates the
  goals/agenda/music/money/search screens, so `typedRoutes` rejects 5 valid `href`s. Runtime is fine;
  regenerate and add it to CI.
- **`/lab/supabase-tasks` ships in the production build** [verified] — it appears in the route table
  and calls `signInAnonymously`. Gate it behind an env check or delete it.
- **No confirmation on destructive mobile actions** — sports delete, reminder delete, goal/task
  delete and `bulkDelete` have no `Alert`. A mis-tap is unrecoverable.
- **Zero accessibility props in mobile** [verified] — `grep` for
  `accessibilityRole|accessibilityLabel|accessibilityState` returns 0 matches across `apps/mobile/src`.
  Tab buttons, chips and toggles are unlabeled; many text-only `Pressable`s are well under the 44pt
  minimum with no `hitSlop`.
- **Unbounded `ScrollView` + `.map`** on growing collections — money transactions
  (`money.tsx:414`), goals, knowledge items, index reminders. Tasks, sports and agenda already use
  `FlatList` correctly.
- **`recurrence.ts:25-26`** — monthly `setMonth` overflows (Jan 31 + 1 month → Mar 3). `:11` parses
  `YYYY-MM-DD` as UTC but reads it with local `getDay`/`setDate`, shifting due dates a day in
  negative-offset timezones.
- **`syncSpotify.ts:86`** splits artists on `", "`, breaking any artist name containing a comma.
- **`consumeOAuthState`** (`state.ts:26-34`) is get-then-delete, not atomic — replayable within the
  same instant. The `pg_cron` sweep for expired rows is commented out in the migration.
- **OAuth tokens are stored in plaintext**, including `repo`-scope GitHub tokens. The migration plan
  already lists encryption as a pre-cutover gate; it is still unchecked.
- **36 npm vulnerabilities**, 2 critical (`next 16.0.0-16.4.0`, `shell-quote`), 18 high.

---

## What is well built

Worth stating plainly, because a list of findings distorts the picture:

- **Firestore rules are correct.** Per-user isolation on every subcollection, no `allow read: if true`,
  no top-level wildcard. `integrationTokens` and `oauthState` are `if false` and live outside the
  `users/{uid}` tree, so OAuth tokens genuinely are unreachable from any client. Every collection
  used in `packages/shared` has a matching rule — no gaps found.
- **Supabase RLS is enabled on all 21 tables** with no `using (true)` anywhere. Token tables have RLS
  on and zero policies (service-role only) and are excluded from the realtime publication.
  `handle_new_user` is `security definer` with `set search_path`.
- **API auth is otherwise solid.** Every route except the four OAuth/cron ones verifies the ID token
  via `requireUid` and takes the uid from the token, never the body. No IDOR found in the other 13.
- **The `data.*` facade is genuinely clean.** After commits #11–#13 there are no leaked
  `firebase/firestore` imports in any app UI code — the hard part of a backend migration is done.
- **Sync writes are idempotent** via deterministic doc ids with `set(..., {merge: true})`, a property
  carried forward into the Supabase composite primary keys.
- **Streak and challenge math is correct** — `streaks.ts` handles the empty list, counts today as
  unbroken, and parses dates with local y/m/d so there is no DST drift. Challenge window bounds are
  right.
- **Token refresh** across all four providers uses a 60s skew and persists rotated refresh tokens;
  Strava's seconds→ms conversion is right.
- **`lazyProxy` admin init** keeps `next build` working without env vars present.
- **Secrets have never been committed** and no server module reaches a client bundle.

---

## Suggested order

1. **C1–C4** — authenticate the two OAuth routes, fail the cron secret closed, validate `returnTo`. Hours, not days.
2. **H1** — stop closing live PRs, and write a one-off repair for tasks already wrongly marked done.
3. **H2** — settle the `createdAt` type before more data accumulates in both shapes.
4. **H3–H6** — AI quotas and caps, cron isolation, SSRF hardening, push unregister on sign-out.
5. **CI** — typecheck all four workspaces, lint, build both web apps, and Vitest over the pure logic
   (`recurrence`, `streaks`, `characteristics`, `finance`). This is the cheapest high-leverage gate
   and it does not exist today.
6. **M1** — decide the Supabase identity bridge before writing any more SQL; make backend selection
   fail closed meanwhile.
7. Mobile UX: keyboard handling, notification handling, delete confirmations, accessibility labels.
