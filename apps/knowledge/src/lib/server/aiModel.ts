import { google } from "@ai-sdk/google";

// Google's Gemini API has a genuinely free, no-credit-card-required tier for
// Flash/Flash-Lite models via Google AI Studio (unlike Vercel's AI Gateway,
// which gates every request — even free-tier ones — behind a card on file).
// Auth is via GOOGLE_GENERATIVE_AI_API_KEY — see README.md for how to get a
// free key. gemini-2.5-flash-lite is the cheapest/fastest free-tier model,
// which fits the Knowledge feature's short, low-stakes generations well.
export const KNOWLEDGE_MODEL = google("gemini-2.5-flash-lite");
