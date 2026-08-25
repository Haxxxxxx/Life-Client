export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskSource = "manual" | "github" | "gitlab" | "google_calendar";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string; // ISO date
  source: TaskSource;
  sourceRef?: string; // e.g. "owner/repo#123" or calendar event id
  sourceUrl?: string;
  tags: string[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export type NewTask = Omit<Task, "id" | "createdAt" | "updatedAt">;

export type SportProvider = "strava";

export interface SportActivity {
  id: string;
  provider: SportProvider;
  externalId: string;
  type: string; // "Run" | "Ride" | "Swim" | ...
  name: string;
  startDate: string; // ISO datetime
  distanceMeters?: number;
  movingTimeSec?: number;
  elevationGainMeters?: number;
  avgHeartRate?: number;
  avgPaceSecPerKm?: number;
  externalUrl?: string;
}

export type IntegrationProvider =
  | "github"
  | "gitlab"
  | "google_calendar"
  | "strava";

export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface IntegrationConnection {
  provider: IntegrationProvider;
  status: IntegrationStatus;
  externalAccountLabel?: string; // e.g. github username, gitlab handle, email
  scopes?: string[];
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
}

export interface DevPullRequest {
  provider: "github" | "gitlab";
  repo: string;
  number: number;
  title: string;
  url: string;
  isReviewRequested: boolean;
  isAuthor: boolean;
  updatedAt: string;
}

export interface DevActivitySummary {
  provider: "github" | "gitlab";
  openPullRequests: DevPullRequest[];
  lastSyncAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  location?: string;
  url?: string;
}
