# Knowledge

A daily AI-generated lesson, code logic drills, a vocabulary builder, and a reading list with
AI summaries — a standalone Next.js app, deployed separately from the main
[Life Client](../../README.md) web app but sharing the same Firebase project and
`packages/shared` data layer.

It's deliberately its own app/deployment (own domain, own Vercel project) rather than a tab
inside `apps/web`, so it can be linked to, iterated on, or eventually spun out independently
without touching the rest of Life Client.

## Setup

```
cp .env.example .env.local   # fill in the values below
npm install                  # from the repo root — installs all workspaces
npm run dev --workspace=knowledge   # or: npm run dev:knowledge from the repo root
```

Env vars (see `.env.example`):
- `NEXT_PUBLIC_FIREBASE_*` — same Firebase project/web-app config as `apps/web`.
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — same service account as `apps/web`, base64-encoded (see
  the root README's "Firebase project" setup step).
- `AI_GATEWAY_API_KEY` — from Vercel Dashboard → AI Gateway → API Keys. Generation is pinned to
  the cheapest available Anthropic model (`anthropic/claude-3-haiku`, see
  `src/lib/server/aiModel.ts`) since these are short, low-stakes generations.

Firebase Auth's **Authorized domains** list needs this app's domain added once deployed
(separately from apps/web's domain) or Google Sign-In will fail here with
`auth/unauthorized-domain`.

## Architecture

```
src/app/page.tsx            The 4 Knowledge sections (lesson, drills, vocab, reading list)
src/app/login/page.tsx      Google sign-in (same Firebase project/users as apps/web)
src/app/api/knowledge/      AI generation routes (Vercel Functions, Node.js runtime)
src/lib/server/admin.ts     firebase-admin — server-only, never bundled to the client
src/lib/server/aiModel.ts   The pinned Vercel AI Gateway model string
src/lib/server/requireAuth.ts  Verifies the caller's Firebase ID token on each API route
```

Data lives in the same Firestore project as `apps/web`/`apps/mobile`, under
`users/{uid}/dailyLessons|codeDrills|vocabWords|readingList` — see `firestore.rules` at the repo
root. Auth is the same Firebase project's Google sign-in, so a Life Client account works here
with no separate signup.

`apps/web` links out to this app's deployed URL via `NEXT_PUBLIC_KNOWLEDGE_APP_URL`; the mobile
app's Knowledge tab calls this app's API routes directly via `EXPO_PUBLIC_KNOWLEDGE_APP_URL`.

## Deploy

Link this directory as its own Vercel project (`vercel link`, root directory `apps/knowledge`),
then push the env vars above with `vercel env add`.
