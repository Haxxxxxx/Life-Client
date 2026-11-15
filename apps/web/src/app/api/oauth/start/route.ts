import { isIntegrationProvider, type IntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { clientIdFor, clientSecretFor, PROVIDER_CONFIG } from "@/lib/server/providers";
import { requireUid } from "@/lib/server/requireAuth";
import { safeReturnToPath } from "@/lib/server/returnTo";
import { createOAuthState } from "@/lib/server/state";

/**
 * Begins a provider OAuth flow for the *authenticated* caller.
 *
 * This used to be a GET taking `?uid=`, which meant anyone could mint an
 * authorization link bound to someone else's account: the attacker authorized
 * with their own provider account and the callback wrote those tokens under the
 * victim's uid. For Google Calendar that was an outbound leak, because the
 * reminder-mirroring routes then wrote the victim's reminders into the
 * attacker's calendar.
 *
 * The uid now comes from a verified Firebase ID token and the query param is
 * gone, so a caller can only ever start a flow for themselves. It returns the
 * provider URL as JSON rather than redirecting, because a bearer token can't
 * ride along on a top-level browser navigation — the client performs the
 * redirect (web) or opens it in the system browser (mobile).
 */
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { origin } = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { provider?: string; returnTo?: string };
  const provider = body.provider;

  if (!isIntegrationProvider(provider)) {
    return NextResponse.json({ error: "Missing or invalid provider" }, { status: 400 });
  }

  // Refuse a provider this deployment has no credentials for, before anything
  // else happens.
  //
  // clientIdFor falls back to "" when the env var is absent, so without this
  // the route cheerfully built an authorize URL with `client_id=` empty and
  // handed it back. The client then navigated to it, and the user landed on
  // the provider's own "invalid client" page — a dead end with nothing
  // indicating the problem was configuration on this side rather than their
  // account. Strava is in exactly that state on the current deployment.
  //
  // Checking before createOAuthState also stops a doomed attempt writing a
  // state document that nothing will ever redeem.
  if (!clientIdFor(provider as IntegrationProvider) || !clientSecretFor(provider as IntegrationProvider)) {
    return NextResponse.json(
      { error: `${provider} is not configured on this deployment` },
      { status: 503 },
    );
  }

  const config = PROVIDER_CONFIG[provider as IntegrationProvider];
  const returnTo = safeReturnToPath(body.returnTo, origin);
  const state = await createOAuthState(uid, provider, returnTo);
  const redirectUri = `${origin}/api/oauth/callback`;

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", clientIdFor(provider as IntegrationProvider));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(config.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return NextResponse.json({ url: url.toString() });
}
