import type { IntegrationProvider } from "@life-client/shared";

export interface ProviderOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraAuthParams?: Record<string, string>;
  /** "basic" sends client_id/secret via an HTTP Basic Authorization header instead
   * of the request body — Spotify requires this; the others accept body params. */
  authStyle?: "body" | "basic";
}

export const PROVIDER_CONFIG: Record<IntegrationProvider, ProviderOAuthConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "repo read:user",
  },
  gitlab: {
    authorizeUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scope: "read_api read_user",
  },
  google_calendar: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // calendar.events (not calendar.readonly) — the Agenda page can create/edit/delete
    // events directly, and this is also the scope reminder-mirroring already needed.
    // Users connected under the old readonly scope must reconnect (prompt:"consent" below
    // already forces a fresh consent screen on every connect).
    scope: "https://www.googleapis.com/auth/calendar.events",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  strava: {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    scope: "activity:read_all",
    extraAuthParams: { approval_prompt: "auto" },
  },
  spotify: {
    authorizeUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scope: "user-read-currently-playing user-read-recently-played user-top-read",
    authStyle: "basic",
  },
};

export function clientIdFor(provider: IntegrationProvider): string {
  switch (provider) {
    case "github":
      return process.env.GITHUB_CLIENT_ID ?? "";
    case "gitlab":
      return process.env.GITLAB_CLIENT_ID ?? "";
    case "google_calendar":
      return process.env.GOOGLE_CLIENT_ID ?? "";
    case "strava":
      return process.env.STRAVA_CLIENT_ID ?? "";
    case "spotify":
      return process.env.SPOTIFY_CLIENT_ID ?? "";
  }
}

export function clientSecretFor(provider: IntegrationProvider): string {
  switch (provider) {
    case "github":
      return process.env.GITHUB_CLIENT_SECRET ?? "";
    case "gitlab":
      return process.env.GITLAB_CLIENT_SECRET ?? "";
    case "google_calendar":
      return process.env.GOOGLE_CLIENT_SECRET ?? "";
    case "strava":
      return process.env.STRAVA_CLIENT_SECRET ?? "";
    case "spotify":
      return process.env.SPOTIFY_CLIENT_SECRET ?? "";
  }
}

interface ExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

function tokenRequestHeaders(config: ProviderOAuthConfig, clientId: string, clientSecret: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (config.authStyle === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }
  return headers;
}

/** POSTs the authorization code to a provider's token endpoint and returns the raw JSON body. */
export async function exchangeCodeForToken(
  provider: IntegrationProvider,
  params: ExchangeParams,
): Promise<Record<string, unknown>> {
  const config = PROVIDER_CONFIG[provider];
  const bodyParams: Record<string, string> = {
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  };
  if (config.authStyle !== "basic") {
    bodyParams.client_id = params.clientId;
    bodyParams.client_secret = params.clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: tokenRequestHeaders(config, params.clientId, params.clientSecret),
    body: new URLSearchParams(bodyParams).toString(),
  });

  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${provider} token exchange returned a non-JSON response: ${response.status} ${text}`);
  }

  // GitHub in particular returns HTTP 200 with an `error` field in the body
  // (e.g. "bad_verification_code") instead of a non-2xx status.
  if (!response.ok || typeof json.error === "string") {
    const detail = typeof json.error_description === "string" ? json.error_description : text;
    throw new Error(`${provider} token exchange failed: ${response.status} ${detail}`);
  }

  return json;
}

interface RefreshParams {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshAccessToken(
  provider: IntegrationProvider,
  params: RefreshParams,
): Promise<Record<string, unknown>> {
  const config = PROVIDER_CONFIG[provider];
  const bodyParams: Record<string, string> = {
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  };
  if (config.authStyle !== "basic") {
    bodyParams.client_id = params.clientId;
    bodyParams.client_secret = params.clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: tokenRequestHeaders(config, params.clientId, params.clientSecret),
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!response.ok) {
    throw new Error(`${provider} token refresh failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
