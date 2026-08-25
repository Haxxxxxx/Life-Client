# Life Client

A single dashboard for tasks, sports performance, and dev activity across your projects —
accessible from both the web (desktop) and a native mobile app.

## Architecture

```
apps/web        Next.js (App Router) — desktop/web client, deploy on Vercel
apps/mobile     Expo (React Native) — iOS/Android client
packages/shared TypeScript package shared by both clients: types, Firebase init,
                Firestore CRUD/subscribe helpers
functions/      Firebase Cloud Functions (v2, TypeScript) — OAuth exchange + scheduled sync
firestore.rules Firestore security rules (per-user data isolation)
```

Data lives in **Firestore**, under `users/{uid}/...` (tasks, sportActivities, devActivity,
calendarEvents, integrations). Auth is **Firebase Authentication** (Google sign-in) on both
clients. Third-party integrations (GitHub, GitLab, Google Calendar, Strava) are connected via
a server-side OAuth flow in Cloud Functions — access tokens never touch the client; only a
connection *status* doc is readable by the owning user.

Sports tracking is wired for **Strava** first. Garmin/Apple Health can be added later by
adding a new provider branch in `functions/src/lib/providers.ts` — Apple Health specifically
has no REST API and would need a native iOS module (HealthKit) instead of the OAuth flow used
here.

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
- **Project settings → Your apps** → add a **Web app** → copy the config into
  `apps/web/.env.local` and `apps/mobile/.env` (see `.env.example` in each — both need the
  same Firebase web config; the JS SDK is the same on Expo).
- **Authentication → Sign-in method → Google → Web SDK configuration** → copy the
  **Web client ID** into `apps/mobile/.env` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
  (native Google Sign-In needs it too — see mobile section below).

### 2. Install dependencies

```
npm install    # installs all workspaces (apps/web, apps/mobile, packages/shared, functions)
```

### 3. Cloud Functions: OAuth apps + secrets

Each integration needs an OAuth app registered with that provider. The callback URL is the
same shape for all four:

```
https://<region>-<project-id>.cloudfunctions.net/oauthCallback
```

(default region is `us-central1` unless you change it in `functions/src/`).

| Provider | Where to create it | Scopes |
|---|---|---|
| GitHub | github.com/settings/developers → New OAuth App | `repo read:user` |
| GitLab | gitlab.com/-/user_settings/applications | `read_api read_user` |
| Google (Calendar) | Google Cloud Console → APIs & Services → enable **Calendar API** → Credentials → OAuth client ID (Web application) | `calendar.readonly` |
| Strava | strava.com/settings/api | `activity:read_all` |

Set each client ID/secret as a Cloud Functions secret (prompts for the value):

```
cd functions
firebase functions:secrets:set GITHUB_CLIENT_ID
firebase functions:secrets:set GITHUB_CLIENT_SECRET
firebase functions:secrets:set GITLAB_CLIENT_ID
firebase functions:secrets:set GITLAB_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set STRAVA_CLIENT_ID
firebase functions:secrets:set STRAVA_CLIENT_SECRET
```

Copy `functions/.env.example` to `functions/.env` and set `WEB_APP_URL` to wherever the web
app is deployed (or `http://localhost:3000` for local dev).

### 4. Deploy Firestore rules + Cloud Functions

```
firebase deploy --only firestore:rules,functions
```

Note the Functions base URL from the deploy output (or build it as
`https://<region>-<project-id>.cloudfunctions.net`) and set it as
`NEXT_PUBLIC_FUNCTIONS_BASE_URL` (web) / `EXPO_PUBLIC_FUNCTIONS_BASE_URL` (mobile).

### 5. Run the web app

```
cp apps/web/.env.example apps/web/.env.local   # fill in the values from step 1/4
npm run dev:web
```

Deploy to Vercel: link `apps/web` as the project root (`vercel link`, set root directory to
`apps/web`), then push env vars with `vercel env add` for each `NEXT_PUBLIC_*` key.

### 6. Run the mobile app

```
cp apps/mobile/.env.example apps/mobile/.env   # fill in the values from step 1/4
cd apps/mobile
npm start
```

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
- **Sports, Dev Activity, Agenda** read live from Firestore and render correctly, but stay
  empty until an integration is connected and has synced at least once.
- **Integrations**: connecting is fully implemented server-side (OAuth exchange, token
  storage, initial + scheduled sync) — it just needs the credentials from step 3 to go live.
  On mobile, connecting opens the system browser rather than deep-linking back into the app;
  the connected status still updates live once the Cloud Function writes it, since both
  clients read the same Firestore doc.
