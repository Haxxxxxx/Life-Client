// Vercel AI Gateway model string. Auth is via AI_GATEWAY_API_KEY (or Vercel's
// OIDC token when deployed on Vercel) — see README.md.
// Deliberately the cheapest available Anthropic model (per-token cost, not
// capability) — the Knowledge feature's lessons/drills/vocab/summaries are
// short, low-stakes generations where cost matters more than top-tier quality.
export const KNOWLEDGE_MODEL = "anthropic/claude-3-haiku";
