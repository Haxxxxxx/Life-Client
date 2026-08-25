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
  totalMergedCount: number;
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

export type CharacteristicId = "discipline" | "fitness" | "craft" | "focus" | "social";
export type CharacteristicSource = "computed" | "manual";

export interface CharacteristicDefinition {
  id: CharacteristicId;
  label: string;
  description: string;
  source: CharacteristicSource;
}

export const CHARACTERISTICS: CharacteristicDefinition[] = [
  {
    id: "discipline",
    label: "Discipline",
    description: "Grows as you complete tasks.",
    source: "computed",
  },
  {
    id: "fitness",
    label: "Fitness",
    description: "Grows with distance and sessions logged on Strava.",
    source: "computed",
  },
  {
    id: "craft",
    label: "Craft",
    description: "Grows with merged PRs and open work on GitHub/GitLab.",
    source: "computed",
  },
  {
    id: "focus",
    label: "Focus",
    description: "Log a deep-work session to grow this.",
    source: "manual",
  },
  {
    id: "social",
    label: "Social",
    description: "Log time well spent with people to grow this.",
    source: "manual",
  },
];

export type ManualEventType = "pro" | "sport" | "bar" | "restaurant" | "other";

export const MANUAL_EVENT_TYPES: { id: ManualEventType; label: string }[] = [
  { id: "pro", label: "Work" },
  { id: "sport", label: "Sport" },
  { id: "bar", label: "Bar" },
  { id: "restaurant", label: "Restaurant" },
  { id: "other", label: "Other" },
];

export interface ManualProgress {
  characteristicId: CharacteristicId;
  sessionCount: number;
  xp: number;
  lastEventType?: ManualEventType;
  lastDurationMinutes?: number;
  lastPeopleCount?: number;
  updatedAt: string;
}

export interface CharacteristicLevel {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-1, how far into the current level
}
