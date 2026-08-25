import { onRequest } from "firebase-functions/v2/https";
import { PROVIDER_CONFIG } from "../lib/providers";
import {
  GITHUB_CLIENT_ID,
  GITLAB_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  STRAVA_CLIENT_ID,
} from "../lib/secrets";
import { createOAuthState } from "../lib/state";
import { isIntegrationProvider, type IntegrationProvider } from "../lib/types";

function clientIdFor(provider: IntegrationProvider): string {
  switch (provider) {
    case "github":
      return GITHUB_CLIENT_ID.value();
    case "gitlab":
      return GITLAB_CLIENT_ID.value();
    case "google_calendar":
      return GOOGLE_CLIENT_ID.value();
    case "strava":
      return STRAVA_CLIENT_ID.value();
  }
}

export const oauthStart = onRequest(
  { secrets: [GITHUB_CLIENT_ID, GITLAB_CLIENT_ID, GOOGLE_CLIENT_ID, STRAVA_CLIENT_ID] },
  async (req, res) => {
    const provider = req.query.provider;
    const uid = req.query.uid;
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/integrations";

    if (!isIntegrationProvider(provider) || typeof uid !== "string" || !uid) {
      res.status(400).send("Missing or invalid provider/uid");
      return;
    }

    const config = PROVIDER_CONFIG[provider];
    const state = await createOAuthState(uid, provider, returnTo);
    const redirectUri = `${req.protocol}://${req.get("host")}/oauthCallback`;

    const url = new URL(config.authorizeUrl);
    url.searchParams.set("client_id", clientIdFor(provider));
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scope);
    url.searchParams.set("state", state);
    for (const [key, value] of Object.entries(config.extraAuthParams ?? {})) {
      url.searchParams.set(key, value);
    }

    res.redirect(url.toString());
  },
);
