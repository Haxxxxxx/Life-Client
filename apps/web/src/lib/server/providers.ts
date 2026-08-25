import type { IntegrationProvider } from "@life-client/shared";

export interface ProviderOAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraAuthParams?: Record<string, string>;
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
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  strava: {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    scope: "activity:read_all",
    extraAuthParams: { approval_prompt: "auto" },
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
  }
}

interface ExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

/** POSTs the authorization code to a provider's token endpoint and returns the raw JSON body. */
export async function exchangeCodeForToken(
  provider: IntegrationProvider,
  params: ExchangeParams,
): Promise<Record<string, unknown>> {
  const config = PROVIDER_CONFIG[provider];
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`${provider} token exchange failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
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
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`${provider} token refresh failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
