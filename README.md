# Life Client

A single dashboard for tasks, sports performance, life-characteristic progression, and dev
activity across your projects — accessible from both the web (desktop) and a native mobile app.

## Architecture

```
apps/web              Next.js (App Router) — desktop/web client, deploy on Vercel
  src/app/api/oauth/   OAuth start/callback/disconnect routes (server-side, Node.js runtime)
  src/app/api/cron/    Scheduled sync endpoint, triggered by Vercel Cron
  src/lib/server/      firebase-admin, OAuth + sync logic — server-only, never bundled to client
apps/knowledge        Next.js (App Router) — separate app + deployment: daily AI lesson, code
                      drills, vocabulary, reading-list summaries. Own domain, same Firebase
                      project as apps/web/apps/mobile.
apps/mobile           Expo (React Native) — iOS/Android client
packages/shared       TypeScript package shared by all three apps: types, Firebase init,
                      Firestore CRUD/subscribe helpers, life-characteristic leveling logic
firestore.rules       Firestore security rules (per-user data isolation)
```

Data lives in **Firestore**, under `users/{uid}/...` (tasks, sportActivities, devActivity,
calendarEvents, integrations, manualProgress). Auth is **Firebase Authentication** (Google
sign-in) on both clients — that stays on Firebase's free Spark plan.

Third-party integrations (GitHub, GitLab, Google Calendar, Strava) are connected via a
server-side OAuth flow that lives in `apps/web`'s own API routes (`/api/oauth/*`), not a
separate backend — Firebase Cloud Functions were the original design but require the paid
Blaze plan, so the whole OAuth exchange + scheduled sync moved to Vercel Functions instead.
Access tokens never touch the client: they're written by `firebase-admin` (via a service
account) directly to Firestore, and only a connection *status* doc is readable by the owning
user (see `firestore.rules`).

On mobile, connecting opens the system browser to the deployed web app's `/api/oauth/start`
route; the connected status still updates live once that route's Firestore write lands, since
both clients read the same document.

Sports tracking is wired for **Strava** first. Garmin/Apple Health can be added later by adding
a new provider branch in `apps/web/src/lib/server/providers.ts` — Apple Health specifically has
no REST API and would need a native iOS module (HealthKit) instead of the OAuth flow used here.

## One-time setup

### 1. Firebase project

```
npm install -g firebase-tools   # if you don't have it
firebase login
firebase projects:create        # or use an existing project
firebase use --add              # link this repo to that project (creates .firebaserc)
```

In the [Firebase Console](https://console.firebase.google.com) for that project:
- **Firestore Database** → create in production mode (any region).
- **Authentication → Sign-in method** → enable **Google**.
- **Authentication → Settings → Authorized domains** → once deployed, add both the apps/web
  domain and the apps/knowledge domain (each is a separate origin, so each needs listing
  separately) — otherwise Google Sign-In will fail with `auth/unauthorized-domain` on
  whichever one is missing.
- **Project settings → Your apps** → add a **Web app** → copy the config into
  `apps/web/.env.local`, `apps/knowledge/.env.local`, and `apps/mobile/.env` (see
  `.env.example` in each — all three need the same Firebase web config; it's the same
  project and the JS SDK is the same on Expo).
- **Authentication → Sign-in method → Google → Web SDK configuration** → copy the
  **Web client ID** into `apps/mobile/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  (native Google Sign-In needs it too — see mobile section below).
- **Project settings → Service accounts → Generate new private key** → downloads a JSON file.
  Base64-encode it and set the result as `FIREBASE_SERVICE_ACCOUNT_BASE64` in both
  `apps/web/.env.local` and `apps/knowledge/.env.local` (locally), and as a Vercel env var for
  each app's project (in production):
  ```
  base64 -i path/to/serviceAccountKey.json | pbcopy   # macOS
  ```
  This lets each app's API routes use `firebase-admin` to read/write Firestore on behalf of
  any user — never commit this file or its base64 value.

Deploy the security rules once you've made this change (or any future rules change):
```
firebase deploy --only firestore:rules
```

### 2. Install dependencies

```
npm install    # installs all workspaces (apps/web, apps/mobile, packages/shared)
```

### 3. OAuth apps for each integration

Each integration needs an OAuth app registered with that provider. The callback URL is the
same shape for all four — your deployed web app's origin plus `/api/oauth/callback`:

```
https://<your-app>.vercel.app/api/oauth/callback        # production
http://localhost:3000/api/oauth/callback                 # local dev
```

| Provider | Where to create it | Scopes |
|---|---|---|
| GitHub | github.com/settings/developers → New OAuth App | `repo read:user` |
| GitLab | gitlab.com/-/user_settings/applications | `read_api read_user` |
| Google (Calendar) | Google Cloud Console → APIs & Services → enable **Calendar API** → Credentials → OAuth client ID (Web application) | `calendar.readonly` |
| Strava | strava.com/settings/api | `activity:read_all` |

Set each client ID/secret in `apps/web/.env.local` (and as Vercel env vars for production):
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`. You
only need to set the ones for integrations you're actually using — the rest can stay blank and
their Connect buttons will just fail gracefully until configured.

Also set `CRON_SECRET` to a random string — it authenticates Vercel Cron's calls to
`/api/cron/sync` (Vercel sets this automatically as a header when deployed; for local testing,
pass `Authorization: Bearer <value>` yourself).

### 4. Run the web app

```
cp apps/web/.env.example apps/web/.env.local   # fill in the values from steps 1 & 3
npm run dev:web
```

**Deploying to Vercel** (this repo is live at https://life-client-web.vercel.app):

apps/web depends on the `packages/shared` workspace package, so the Vercel project must be
linked and deployed from the **repo root** (not `apps/web`) — otherwise the upload doesn't
include `packages/shared` and `npm install` fails with a 404 for `@life-client/shared`. The
Vercel project's **Root Directory** setting (Dashboard → Settings → General → Root Directory)
is set to `apps/web` so the build itself still runs scoped there. A root-level `.vercelignore`
excludes `node_modules`, `apps/mobile`, and `apps/knowledge` from the upload (irrelevant to this
project and large enough to hit Vercel's file-count limit otherwise).

```
cd <repo root>
vercel link --yes --project life-client-web   # first time only
vercel env add <NAME> production              # once per key above, reading from .env.local
vercel --prod --yes
```

The cron schedule in `apps/web/vercel.json` takes effect automatically once deployed — it runs
once daily (Vercel's free Hobby plan only allows daily cron jobs; a Pro plan unlocks more
frequent schedules like every 30 minutes). You can always trigger a sync on demand in the
meantime:
```
curl -H "Authorization: Bearer $CRON_SECRET" https://life-client-web.vercel.app/api/cron/sync
```

### 5. Run the Knowledge app (apps/knowledge)

Knowledge (daily AI lesson, code drills, vocabulary, reading-list summaries) is its **own**
Next.js app and its own Vercel deployment — a separate project/domain from apps/web, sharing
only the same Firebase project and `packages/shared`.

It calls Anthropic's Claude through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway),
deliberately pinned to the cheapest available model (`anthropic/claude-3-haiku` — see
`apps/knowledge/src/lib/server/aiModel.ts`) since these generations are short and low-stakes.
Get an API key from your Vercel dashboard → **AI Gateway → API Keys**.

```
cp apps/knowledge/.env.example apps/knowledge/.env.local   # fill in Firebase config (step 1),
                                                            # FIREBASE_SERVICE_ACCOUNT_BASE64,
                                                            # and AI_GATEWAY_API_KEY
npm run dev:knowledge
```

(When deployed on Vercel with the AI Gateway enabled for the project, `AI_GATEWAY_API_KEY` can
also be skipped in favor of Vercel's OIDC token — the env var is the simplest path for local
dev.)

Deploy to Vercel as its own project: link `apps/knowledge` as the project root (`vercel link`,
set root directory to `apps/knowledge`), push the same env vars with `vercel env add`. Once you
have its production domain, set it as `NEXT_PUBLIC_KNOWLEDGE_APP_URL` in `apps/web/.env.local`
(so Life Client's nav can link out to it) and as `EXPO_PUBLIC_KNOWLEDGE_APP_URL` in
`apps/mobile/.env` (so the mobile Knowledge tab calls the right backend) — and don't forget the
Authorized domains step above.

### 6. Run the mobile app

```
cp apps/mobile/.env.example apps/mobile/.env   # fill in the values from step 1
cd apps/mobile
npm start
```

Set `EXPO_PUBLIC_WEB_APP_URL` once the web app is deployed (e.g. `https://life-client.vercel.app`)
so mobile's Connect buttons can open the right OAuth start URL in the system browser. Set
`EXPO_PUBLIC_KNOWLEDGE_APP_URL` once the Knowledge app is deployed (step 5) so the mobile
Knowledge tab can reach its API routes.

Everything works in Expo Go **except Google Sign-In**: `@react-native-google-signin/google-signin`
is a native module, so it needs a development build:

```
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

You'll also need `GoogleService-Info.plist` (iOS) / `google-services.json` (Android) from the
Firebase Console apps you create for each platform, placed per that package's install docs.

## What's real vs. what's scaffolded

- **Tasks** (create/update/complete/delete) work fully on both clients right now, backed by
  Firestore.
- **Profile** shows account info plus five trainable life characteristics (Discipline, Fitness,
  Craft — computed live from Tasks/Strava/dev-activity — and Focus/Social, logged manually via
  an event form: type, duration, headcount).
- **Sports, Dev Activity, Agenda** read live from Firestore and render correctly, but stay empty
  until an integration is connected and has synced at least once.
- **Knowledge** (daily lesson, code drills, vocabulary, reading-list summaries) lives in its own
  app (`apps/knowledge`) and is fully implemented end to end — it just needs its own deployment
  plus `AI_GATEWAY_API_KEY` (step 5) to actually generate anything. Life Client (`apps/web`)
  links out to it once `NEXT_PUBLIC_KNOWLEDGE_APP_URL` is set; the mobile app has its own
  Knowledge tab pointed at the same backend via `EXPO_PUBLIC_KNOWLEDGE_APP_URL`.
- **Integrations**: connecting is fully implemented (OAuth exchange, token storage, initial +
  scheduled sync via Vercel Cron) — it just needs the credentials from step 3 to go live.
- **Remember** tracks anything with a deadline (referral codes, trial expirations, renewal
  dates). Reminders due within 2 days are highlighted in the Remember tab itself and surfaced on
  the Dashboard — this is computed client-side from the deadline, no email/push yet. Email
  delivery (1/2 days before) was designed for but not wired up: it needs a domain you control so
  Resend can verify a sender (Vercel's own `*.vercel.app` domains can't be used for this since
  Vercel controls their DNS, not you) — revisit once a domain is available.
