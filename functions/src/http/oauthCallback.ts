import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { setIntegrationStatus } from "../lib/integrations";
import { exchangeCodeForToken } from "../lib/providers";
import {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GITLAB_CLIENT_ID,
  GITLAB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  WEB_APP_URL,
} from "../lib/secrets";
import { syncGoogleCalendarForUser } from "../scheduled/syncCalendar";
import { syncGithubForUser, syncGitlabForUser } from "../scheduled/syncDevActivity";
import { syncStravaForUser } from "../scheduled/syncStrava";
import { consumeOAuthState } from "../lib/state";
import { storeTokens } from "../lib/tokens";
import type { IntegrationProvider } from "../lib/types";

interface ExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  externalAccountLabel?: string;
}

async function fetchGithubLogin(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${accessToken}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { login?: string };
  return data.login;
}

async function fetchGitlabUsername(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://gitlab.com/api/v4/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { username?: string };
  return data.username;
}

async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { email?: string };
  return data.email;
}

async function handleExchange(
  provider: IntegrationProvider,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  switch (provider) {
    case "github": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: GITHUB_CLIENT_ID.value(),
        clientSecret: GITHUB_CLIENT_SECRET.value(),
        code,
        redirectUri,
      });
      const accessToken = raw.access_token as string;
      return {
        accessToken,
        scope: raw.scope as string | undefined,
        externalAccountLabel: await fetchGithubLogin(accessToken),
      };
    }
    case "gitlab": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: GITLAB_CLIENT_ID.value(),
        clientSecret: GITLAB_CLIENT_SECRET.value(),
        code,
        redirectUri,
      });
      const accessToken = raw.access_token as string;
      return {
        accessToken,
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt: raw.created_at && raw.expires_in ? ((raw.created_at as number) + (raw.expires_in as number)) * 1000 : undefined,
        externalAccountLabel: await fetchGitlabUsername(accessToken),
      };
    }
    case "google_calendar": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: GOOGLE_CLIENT_ID.value(),
        clientSecret: GOOGLE_CLIENT_SECRET.value(),
        code,
        redirectUri,
      });
      const accessToken = raw.access_token as string;
      return {
        accessToken,
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt: raw.expires_in ? Date.now() + (raw.expires_in as number) * 1000 : undefined,
        scope: raw.scope as string | undefined,
        externalAccountLabel: await fetchGoogleEmail(accessToken),
      };
    }
    case "strava": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: STRAVA_CLIENT_ID.value(),
        clientSecret: STRAVA_CLIENT_SECRET.value(),
        code,
        redirectUri,
      });
      const athlete = raw.athlete as { username?: string; firstname?: string; lastname?: string } | undefined;
      return {
        accessToken: raw.access_token as string,
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt: raw.expires_at ? (raw.expires_at as number) * 1000 : undefined,
        externalAccountLabel:
          athlete?.username ?? ([athlete?.firstname, athlete?.lastname].filter(Boolean).join(" ") || undefined),
      };
    }
  }
}

async function triggerInitialSync(provider: IntegrationProvider, uid: string): Promise<void> {
  switch (provider) {
    case "github":
      await syncGithubForUser(uid);
      return;
    case "gitlab":
      await syncGitlabForUser(uid);
      return;
    case "google_calendar":
      await syncGoogleCalendarForUser(uid);
      return;
    case "strava":
      await syncStravaForUser(uid);
      return;
  }
}

export const oauthCallback = onRequest(
  {
    secrets: [
      GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET,
      GITLAB_CLIENT_ID,
      GITLAB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      STRAVA_CLIENT_ID,
      STRAVA_CLIENT_SECRET,
    ],
  },
  async (req, res) => {
    const code = req.query.code;
    const stateToken = req.query.state;

    if (typeof code !== "string" || typeof stateToken !== "string") {
      res.status(400).send("Missing code/state");
      return;
    }

    const state = await consumeOAuthState(stateToken);
    if (!state) {
      res.status(400).send("Invalid or expired OAuth state");
      return;
    }

    const provider = state.provider as IntegrationProvider;
    const redirectUri = `${req.protocol}://${req.get("host")}/oauthCallback`;

    try {
      const result = await handleExchange(provider, code, redirectUri);

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

      await triggerInitialSync(provider, state.uid).catch((error) =>
        logger.error(`Initial sync failed for ${provider}/${state.uid}`, error),
      );
    } catch (error) {
      logger.error(`OAuth callback failed for ${provider}`, error);
      await setIntegrationStatus(state.uid, provider, {
        status: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
    }

    res.redirect(`${WEB_APP_URL.value()}${state.returnTo}`);
  },
);
