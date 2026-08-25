import { defineSecret, defineString } from "firebase-functions/params";

export const GITHUB_CLIENT_ID = defineSecret("GITHUB_CLIENT_ID");
export const GITHUB_CLIENT_SECRET = defineSecret("GITHUB_CLIENT_SECRET");

export const GITLAB_CLIENT_ID = defineSecret("GITLAB_CLIENT_ID");
export const GITLAB_CLIENT_SECRET = defineSecret("GITLAB_CLIENT_SECRET");

export const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

export const STRAVA_CLIENT_ID = defineSecret("STRAVA_CLIENT_ID");
export const STRAVA_CLIENT_SECRET = defineSecret("STRAVA_CLIENT_SECRET");

// Base URL of the deployed web app, e.g. https://life-client.vercel.app — used to
// build the redirect back to the app after an OAuth flow completes.
export const WEB_APP_URL = defineString("WEB_APP_URL", {
  default: "http://localhost:3000",
});

export const ALL_OAUTH_SECRETS = [
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GITLAB_CLIENT_ID,
  GITLAB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
];
