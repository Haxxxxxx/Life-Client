// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { google } from "@ai-sdk/google";

// Google's Gemini API has a genuinely free, no-credit-card-required tier for
// Flash/Flash-Lite models via Google AI Studio (unlike Vercel's AI Gateway,
// which gates every request — even free-tier ones — behind a card on file).
// Auth is via GOOGLE_GENERATIVE_AI_API_KEY — see README.md for how to get a
// free key. gemini-3.5-flash-lite is the cheapest/fastest free-tier model
// available to new API keys as of writing (2.5-flash-lite was retired for
// new users — verify against https://ai.google.dev/gemini-api/docs/models
// if this starts failing with a 404 again), which fits the Knowledge
// feature's short, low-stakes generations well.
export const KNOWLEDGE_MODEL = google("gemini-3.5-flash-lite");
