# Life Client — review, round 2

**Date:** 2026-11-10 · **Baseline:** `origin/main` · **Scope:** `apps/knowledge` client code, and the pure domain logic in `packages/shared`

Follow-up to `code-review-2026-11-10.md`, covering the two areas the first pass
admittedly only skimmed. Every finding below was re-verified against `origin/main`.

---

## First: a correction to round 1

**The round-1 review ran against a tree 9 commits behind `origin/main`.** The local
working copy sat at `718f8cf`; `origin/main` was already at `75a645c`, with PRs #16–#24
merged on top (charts for web/mobile/knowledge, the mobile dark redesign, EAS build
fixes, a mobile layout audit, and auto-archive).

I re-checked every round-1 finding against `origin/main`:

**Still real** (all of these were confirmed on `origin/main`, not just the stale tree):

- All four criticals — the OAuth routes and `oauth/callback` were untouched by those
  nine commits, and `cron/sync/route.ts` still had the fail-open comparison. Fixed in PR #26.
- H1, the PR-closing bug — `syncDevActivity.ts` is byte-identical on `origin/main`.
- H2, the split `createdAt` — `tasks.ts:57` still writes `serverTimestamp()` while the
  sync writes an ISO string, and `tasks.ts:29` still orders by it.
- Mobile: still zero keyboard handling, zero accessibility props, no push unregister on
  sign-out, no `setNotificationHandler`. The #20 "layout audit" commit did not touch these.

**Already fixed upstream** — one finding only:

- The round-2 knowledge review flagged `knowledgeApi.ts` throwing raw response bodies as
  UI error text. That is true of the reviewed tree but **fixed on `origin/main`** by #21
  ("stop rendering raw HTML error bodies"), which added `errorMessageFromBody` and
  `extractErrorField`. Disregard it.

The practical lesson is the one already in round 1: there is no CI, so nothing tells you
which tree anyone is looking at.

---

## Domain logic — `packages/shared`

This is where the real damage is. These bugs corrupt stored data quietly and are
near-impossible to notice by using the app.

### D1. `reminderUrgency` never returns "due-today" for anything due today [verified by execution]
`packages/shared/src/reminders.ts:70-81` computes calendar-day urgency by dividing
milliseconds and rounding up. I ran it with `now = Nov 10, 09:00`:

| deadline | `daysUntil` | bucket | should be |
|---|---|---|---|
| today 17:00 | 1 | `due-soon` | **due-today** |
| in 30 min | 1 | `due-soon` | **due-today** |
| 30 min ago | 0 | `due-today` | **overdue** |
| 23 h ago | 0 | `due-today` | **overdue** |

The bucket is inverted. `Math.ceil(-0.02)` is `-0`, and `-0 === 0` is `true`, so anything
overdue by less than 24 h reports "due-today", while nothing in the future ever does.
`overdue` only fires after a full 24 hours.

This feeds `sendDailyDigests.ts:37`, so the daily push digest inherits it.

**Fix:** return `overdue` when `deadline < now`; otherwise compare local start-of-day date
keys rather than dividing milliseconds — which is also DST-unsafe.

### D2. Strava activities can never satisfy an endurance challenge [verified]
`types.ts:150` documents Strava's values as `"Run" | "Ride" | "Swim"`. Sixteen lines
later, `types.ts:166` defines `ENDURANCE_EXERCISE_PRESETS = ["Running", "Cycling", "Swimming"]`.
`challenges.ts:79` compares them with strict `!==`, and `syncStrava.ts:59` writes Strava's
raw `activity.type`.

So a "30 Days of Running" challenge never counts a single synced run: every day reads 0,
streak 0, no milestone ever fires. The two contradicting lines are in the same file.

**Fix:** normalize on write, or compare through a canonical map.

### D3. XP and challenge progress are computed from a truncated 50-row window [verified]
`sports.ts:37` defaults `subscribeSportActivities` to `max = 50` with a hard `limit(max)`,
and every consumer uses the default.

- **Challenges** (`challenges.ts:78-89`): a 100-day challenge at 1 log/day reads days 1–10
  as zero once you pass day 60. `completedCount` caps at 50, so the 75% and 100% milestones
  are unreachable — day 100 shows 50/100.
- **Fitness XP** (`characteristics.ts:315-324`) stops being monotonic: logging a 5 km run
  (+55) evicts the 51st-oldest activity, which might be a 20 km run (−205). **Your level can
  go down because you exercised.**
- **Insight XP** is inconsistent across screens — the knowledge screens subscribe with
  `max=400` while profile and dashboard use 30, so the same user sees different Insight
  levels in different places.

**Fix:** query challenges by date range with no row cap; use one shared window for XP, or
maintain stored aggregates.

### D4. Money is booked to the wrong month near month boundaries [verified]
`money/page.tsx:111` defaults the date to `new Date().toISOString().slice(0, 10)` — UTC —
while `finance.ts:81-84` buckets with `monthKey()`, which is local.

At UTC−8 on Oct 31 18:00 local, the transaction is stored as `2026-11-01`. October's spend
and budget silently omit it while the user is still in October.

**Fix:** use the local date builder, as the challenge form already does.

### D5. Supabase `advanceTaskStatusSb` never refunds a vice penalty [verified]
`supabase/tasks.ts:167` still carries the comment "the ViceLog side-effect is deferred
until vices are migrated" — but vices *are* migrated (`log_vice` RPC and
`setViceLogCompensatedSb` both exist), and nothing calls `setViceLogCompensatedSb`.

Log a vice (−30 fitness), complete its compensating task, and on Firestore you get the 30
back; on Supabase the penalty is permanent. Latent today, since the flag is `firebase`.

### D6. Smaller domain findings
- **`logManualEventSb`** (`supabase/characteristics.ts:62-80`) is read-modify-write, not an
  increment — two concurrent submits lose one. The Firestore path uses atomic `increment()`.
- **Float money**: `computeMonthlySpend` sums JS doubles. A 3.30 budget against 1.10 + 2.20
  gives 3.3000000000000003 — `remaining` renders "-0.00" and may flag over-budget. Store
  integer cents.
- **`levelFromXp(Infinity)` loops forever** (`characteristics.ts:50`), and
  `TASK_DIFFICULTY_XP[task.difficulty ?? "medium"]` yields `undefined` for any unexpected
  string, making the whole sum `NaN`. Firestore has no CHECK constraint to prevent that.
- **Zero/negative challenge targets are accepted** — `dailyTarget = 0` means every day
  counts as complete with no activity. No SQL check, and the edit form's `Number(x) ? …`
  guard passes negatives.
- **Recurring tasks break goal progress**: the next occurrence is spawned on every
  transition to done and carries `goalId`, so a goal with one recurring task goes 0/1 →
  1/2 → 2/3 and never reaches 100%.
- **`currentStreak` forgives a missed final day** on a finished challenge: a 10-day
  challenge that ended 30 days ago with day 10 missed still reports a streak of 9.
- **Vice XP is farmable** — logging a vice and completing its compensating task nets
  *positive* XP, since the task also earns discipline + health.

**Verified correct:** `levelFromXp` is monotonic with no off-by-one at exact thresholds
(100 → L2, 99 → L1, 300 → L3); `computeGoalProgress` guards empty and zero-link cases;
challenge window bounds are right; milestone ratios are exact in binary; `streaks.ts` is
clean, including DST.

---

## `apps/knowledge` client

### K1. "Today" means two different days [verified]
`lesson/route.ts:132` calls `todayLessonId()` **on the server** (UTC on Vercel); the client
calls it in local time. At UTC−5, 21:00 local on Nov 10 is Nov 11 UTC, so the server writes
doc `2026-11-11` and the client looks for `2026-11-10` — "no lesson today", and the streak
walks local dates over UTC ids. The function's own doc comment claims local time, which is
wrong for the server path. Same root cause as D4: three writers, three timezones, all
readers local.

### K2. The fallback lesson is permanent [verified]
If all seven feeds fail, `lesson/route.ts:186-196` persists a lesson reading "try generating
again in a bit" — but `existing.exists` short-circuits every later POST, so that day's
lesson can never be regenerated. The placeholder still counts toward XP and streak.

### K3. Grading after delete resurrects a corrupt orphan
Both grade routes `ref.set(..., {merge: true})` *after* a 5–30 s LLM call, while the Delete
button stays enabled. Deleting mid-grade recreates the doc containing only grade fields —
no `createdAt`, so `orderBy("createdAt")` excludes it forever. Invisible, undeletable.
Use `ref.update()`, which fails with NOT_FOUND.

### K4. Concurrent lesson generation desyncs, not just wastes tokens
`lesson/route.ts:196` uses `set()`, not `create()`. Two concurrent requests each write a
full lesson and each append a readingList item: the client that got response A displays
lesson A while Firestore holds lesson B. Use `create()` and return the stored doc on
ALREADY_EXISTS.

### K5. Single-slot in-flight state re-enables buttons mid-request
`summarizingId` and `deletingId` hold one id. Click Summarize on A then B: A's button
re-enables while A is still running, and when A settles the `finally` clears B's guard
mid-flight. Duplicate LLM calls and duplicate writes. Use a `Set<string>`.

### K6. Grading is not idempotent and XP is farmable
No route checks a `graded` flag, grading temperature is default (so re-rolling the same
answer gives different scores), and "Show answer instead" reveals the model solution that
can then be pasted for a ≥7. Resubmitting a vocab sentence wrongly flips `practiceCorrect`
back to false — un-learning the word.

### K7. Other
- The summarize route can throw from inside its own `catch` (both the `try` and the `catch`
  call `ref.update`), producing a non-JSON 500.
- The lesson route reads the *entire* dailyLessons history on every generation and injects
  every past word into the prompt — read cost and prompt size grow without bound.
- Language alternation keys off `historySnap.size % 2`, which breaks on any deletion.
- Login has a hydration mismatch: `useState(() => auth !== null)` is false during SSR and
  true on the client.
- No subscription passes `onError`, so a missing index renders as "No drills yet".
- `whitespace-pre-wrap` is missing on `codeExplanation` and `drill.prompt`, so code examples
  collapse to one line.
- Accessibility: every input is placeholder-only with no label; difficulty and mastery
  toggles convey state by color alone with no `aria-pressed`; `ErrorText` has no
  `role="alert"`; focus is dropped to `<body>` when the drill form unmounts on submit.

**Verified healthy:** no `dangerouslySetInnerHTML` anywhere — summaries, takeaways and
feedback all render as text, so the stored AI output is not an XSS vector.

---

## Revised priority

The round-1 order still holds for security. On top of it, these two are the highest-value
data-integrity fixes, because both are silently corrupting stored state right now:

1. **D1** (`reminderUrgency`) — a handful of lines, and it currently inverts every reminder
   bucket plus the daily digest.
2. **D2** (`"Run"` vs `"Running"`) — one mapping, and it's the difference between the
   challenge feature working and not working at all.
3. **D3** (the 50-row cap) — needs a little design thought, but "your level drops when you
   exercise" is the worst user-visible bug in the codebase.
4. **K1 + D4** together — settle one contract for what "today" and "this month" mean, in one
   timezone, and apply it to all writers.
5. **K2, K3, K4** — small, self-contained server fixes.

And the standing recommendation from round 1: **add CI**. Every finding in both documents is
the kind a typecheck, a lint and a handful of unit tests over `reminders`, `challenges`,
`finance` and `characteristics` would have caught or prevented — and without it, nobody can
even tell which commit a review was run against.
