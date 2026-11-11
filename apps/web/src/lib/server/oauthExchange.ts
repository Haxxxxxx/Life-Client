// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

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

async function fetchSpotifyDisplayName(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { display_name?: string };
  return data.display_name;
}

function requireAccessToken(provider: IntegrationProvider, raw: Record<string, unknown>): string {
  if (typeof raw.access_token !== "string" || !raw.access_token) {
    // Key names only, never values. This used to interpolate
    // JSON.stringify(raw) — the whole token-endpoint response — and the
    // caller in api/oauth/callback writes a failure straight into the
    // integration's `lastError`, which Firestore persists and the
    // Integrations page renders verbatim. All that is established here is
    // that `access_token` is missing; `refresh_token` or `id_token` can still
    // be sitting in that object. The field names are what makes the failure
    // diagnosable, and they are not secret.
    const keys = Object.keys(raw).sort().join(", ") || "<empty response>";
    throw new Error(`${provider} token exchange response had no access_token (fields: ${keys})`);
  }
  return raw.access_token;
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
      const accessToken = requireAccessToken(provider, raw);
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
      const accessToken = requireAccessToken(provider, raw);
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
      const accessToken = requireAccessToken(provider, raw);
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
        accessToken: requireAccessToken(provider, raw),
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt: raw.expires_at ? (raw.expires_at as number) * 1000 : undefined,
        externalAccountLabel:
          athlete?.username ?? ([athlete?.firstname, athlete?.lastname].filter(Boolean).join(" ") || undefined),
      };
    }
    case "spotify": {
      const raw = await exchangeCodeForToken(provider, {
        clientId: clientIdFor("spotify"),
        clientSecret: clientSecretFor("spotify"),
        code,
        redirectUri,
      });
      const accessToken = requireAccessToken(provider, raw);
      return {
        accessToken,
        refreshToken: raw.refresh_token as string | undefined,
        expiresAt: raw.expires_in ? Date.now() + (raw.expires_in as number) * 1000 : undefined,
        scope: raw.scope as string | undefined,
        externalAccountLabel: await fetchSpotifyDisplayName(accessToken),
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
    case "spotify": {
      const { syncSpotifyForUser } = await import("./syncSpotify");
      await syncSpotifyForUser(uid);
      return;
    }
  }
}
