export type IntegrationProvider = "github" | "gitlab" | "google_calendar" | "strava";

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return value === "github" || value === "gitlab" || value === "google_calendar" || value === "strava";
}
