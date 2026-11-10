import type { IntegrationProvider } from "@life-client/shared";
import { NextRequest, NextResponse, after } from "next/server";
import { setIntegrationStatus } from "@/lib/server/integrationStatus";
import { handleOAuthExchange, triggerInitialSync } from "@/lib/server/oauthExchange";
import { safeReturnTo } from "@/lib/server/returnTo";
import { consumeOAuthState } from "@/lib/server/state";
import { storeTokens } from "@/lib/server/tokens";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const stateToken = searchParams.get("state");

  if (!code || !stateToken) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  const state = await consumeOAuthState(stateToken);
  if (!state) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  const provider = state.provider as IntegrationProvider;
  const redirectUri = `${origin}/api/oauth/callback`;

  try {
    const result = await handleOAuthExchange(provider, code, redirectUri);

    await storeTokens(state.uid, provider, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      scope: result.scope,
    });

    await setIntegrationStatus(state.uid, provider, {
      status: "connected",
      externalAccountLabel: result.externalAccountLabel,
      connectedAt: new Date().toISOString(),
    });

    after(() =>
      triggerInitialSync(provider, state.uid).catch((error) =>
        console.error(`Initial sync failed for ${provider}/${state.uid}`, error),
      ),
    );
  } catch (error) {
    console.error(`OAuth callback failed for ${provider}`, error);
    await setIntegrationStatus(state.uid, provider, {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  // `state.returnTo` is sanitized when the state is created, but re-validate on
  // the way out: state docs written before that change are still in Firestore.
  return NextResponse.redirect(safeReturnTo(state.returnTo, origin));
}
