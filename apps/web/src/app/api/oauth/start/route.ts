import { isIntegrationProvider, type IntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse } from "next/server";
import { clientIdFor, PROVIDER_CONFIG } from "@/lib/server/providers";
import { createOAuthState } from "@/lib/server/state";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const provider = searchParams.get("provider");
  const uid = searchParams.get("uid");
  const returnTo = searchParams.get("returnTo") ?? "/integrations";

  if (!isIntegrationProvider(provider) || !uid) {
    return NextResponse.json({ error: "Missing or invalid provider/uid" }, { status: 400 });
  }

  const config = PROVIDER_CONFIG[provider as IntegrationProvider];
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

  return NextResponse.redirect(url.toString());
}
