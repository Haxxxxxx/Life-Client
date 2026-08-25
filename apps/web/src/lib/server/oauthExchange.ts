import type { IntegrationProvider } from "@life-client/shared";
import { clientIdFor, clientSecretFor, exchangeCodeForToken } from "./providers";

export interface ExchangeResult {
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

export async function handleOAuthExchange(
  provider: IntegrationProvider,
  code: string,
  redirectUri: string,
): Promise<ExchangeResult> {
  switch (provider) {
    case "github": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: clientIdFor("github"),
        clientSecret: clientSecretFor("github"),
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
        clientId: clientIdFor("gitlab"),
        clientSecret: clientSecretFor("gitlab"),
        code,
        redirectUri,
      });
      const accessToken = raw.access_token as string;
      return {
        accessToken,
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt:
          raw.created_at && raw.expires_in
            ? ((raw.created_at as number) + (raw.expires_in as number)) * 1000
            : undefined,
        externalAccountLabel: await fetchGitlabUsername(accessToken),
      };
    }
    case "google_calendar": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: clientIdFor("google_calendar"),
        clientSecret: clientSecretFor("google_calendar"),
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
        clientId: clientIdFor("strava"),
        clientSecret: clientSecretFor("strava"),
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

export async function triggerInitialSync(provider: IntegrationProvider, uid: string): Promise<void> {
  switch (provider) {
    case "github": {
      const { syncGithubForUser } = await import("./syncDevActivity");
      await syncGithubForUser(uid);
      return;
    }
    case "gitlab": {
      const { syncGitlabForUser } = await import("./syncDevActivity");
      await syncGitlabForUser(uid);
      return;
    }
    case "google_calendar": {
      const { syncGoogleCalendarForUser } = await import("./syncCalendar");
      await syncGoogleCalendarForUser(uid);
      return;
    }
    case "strava": {
      const { syncStravaForUser } = await import("./syncStrava");
      await syncStravaForUser(uid);
      return;
    }
  }
}
