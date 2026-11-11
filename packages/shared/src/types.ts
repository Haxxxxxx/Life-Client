export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskSource = "manual" | "github" | "gitlab" | "google_calendar";

export const TASK_PRIORITIES: { id: TaskPriority; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export type TaskDifficulty = "easy" | "medium" | "hard" | "harder" | "hardest";

export const TASK_DIFFICULTIES: { id: TaskDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "harder", label: "Harder" },
  { id: "hardest", label: "Hardest" },
];

/** XP a completed task of this difficulty contributes to Discipline and its category stat. */
export const TASK_DIFFICULTY_XP: Record<TaskDifficulty, number> = {
  easy: 10,
  medium: 20,
  hard: 35,
  harder: 55,
  hardest: 80,
};

export type TaskCategory =
  | "work"
  | "personal"
  | "health"
  | "learning"
  | "sport"
  | "creativity"
  | "endurance"
  | "self_work"
  | "code"
  | "reading"
  | "blender";

export const TASK_CATEGORIES: { id: TaskCategory; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "personal", label: "Personal" },
  { id: "health", label: "Health" },
  { id: "learning", label: "Learning" },
  { id: "sport", label: "Sport" },
  { id: "creativity", label: "Creativity" },
  { id: "endurance", label: "Endurance" },
  { id: "self_work", label: "Self-work" },
  { id: "code", label: "Code" },
  { id: "reading", label: "Reading" },
  { id: "blender", label: "3D / Blender" },
];

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number; // e.g. every 2 weeks
  daysOfWeek?: number[]; // 0=Sun..6=Sat — only meaningful when freq is "weekly"
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  category: TaskCategory;
  dueDate?: string; // ISO date
  source: TaskSource;
  sourceRef?: string; // e.g. "owner/repo#123" or calendar event id
  sourceUrl?: string;
  tags: string[];
  goalId?: string; // links this task to a parent Goal
  recurrence?: Recurrence; // when set, completing this task creates the next occurrence
  viceLogId?: string; // reverse link — completing this task marks the linked ViceLog compensated
  prMeta?: TaskPrMeta; // present only on github/gitlab-sourced tasks — drives the PR badges
  prEvents?: PrEvent[]; // append-only (capped) log of PR changes the sync has observed
  archived?: boolean; // set by the daily cleanup cron once done 30+ days — hidden from lists, never deleted
  // Set only on the todo/in-progress -> done transition, cleared when it moves back off
  // done — unlike updatedAt, which bumps on any field edit, so a later rename/link
  // doesn't reattribute a task's completion date to whenever it was last touched.
  completedAt?: string | null; // ISO datetime
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

/** Snapshot of a mirrored PR/MR, denormalised onto the task so the Tasks list can
 * render state/CI/author badges without also subscribing to `devActivity`. Kept in
 * sync by `syncDevActivity` on every run. */
export interface TaskPrMeta {
  state: PrState;
  checks: PrCheckStatus;
  isBot: boolean; // Dependabot / Renovate / any automated author
  mine: boolean; // authored by the connected user, or their review is requested
  author: string; // author login, e.g. "dependabot[bot]" or a username
  reviewDecision?: PrReviewDecision | null; // GitHub only; null when not computable
  additions?: number | null;
  deletions?: number | null;
  baseRef?: string | null; // branch the PR merges into, e.g. "main"
  headRef?: string | null; // branch the PR is from, e.g. "fix/courses"
  prCreatedAt?: string | null; // when the PR was opened (ISO)
  prUpdatedAt?: string | null; // the PR's own updatedAt (ISO)
  resolvedAt?: string | null; // when it was merged or closed (ISO); null while open
}

/** A change the sync observed on a mirrored PR between two runs — powers the
 * activity log on the task details page. `at` is when the sync saw it, not the
 * exact GitHub/GitLab event time. */
export interface PrEvent {
  at: string; // ISO
  kind: "state" | "checks" | "review";
  detail: string; // "merged", "closed", "ci: success", "approved", …
}

export type NewTask = Omit<Task, "id" | "createdAt" | "updatedAt">;

/**
 * A task update. `null` means "clear this field"; omitting it means "leave it".
 *
 * Needed because `undefined` cannot express "clear": Firestore is initialised
 * with ignoreUndefinedProperties, which drops undefined keys from the write,
 * and updateDoc only touches the keys it receives — so sending undefined left
 * the old value in place and made clearing a field a silent no-op.
 */
export type TaskPatch = Partial<Omit<NewTask, "dueDate" | "goalId" | "recurrence">> & {
  dueDate?: string | null;
  goalId?: string | null;
  recurrence?: Recurrence | null;
};

export type GoalStatus = "active" | "completed" | "archived";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  targetDate?: string; // ISO date, optional deadline
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export type NewGoal = Omit<Goal, "id" | "status" | "createdAt" | "updatedAt">;

export interface GoalProgress {
  linkedTaskCount: number;
  completedTaskCount: number;
  percent: number; // 0-1
}

export type SportProvider = "strava" | "manual";
export type SportActivityKind = "endurance" | "strength";

export interface SportActivity {
  id: string;
  provider: SportProvider;
  kind: SportActivityKind;
  externalId?: string;
  type: string; // "Run" | "Ride" | "Swim" | "Squats" | "Push-ups" | ...
  name: string;
  startDate: string; // ISO datetime
  // endurance metrics
  distanceMeters?: number;
  movingTimeSec?: number;
  elevationGainMeters?: number;
  avgHeartRate?: number;
  avgPaceSecPerKm?: number;
  // strength metrics
  reps?: number;
  sets?: number;
  weightKg?: number;
  externalUrl?: string;
}

export const ENDURANCE_EXERCISE_PRESETS = ["Running", "Cycling", "Swimming"];
export const STRENGTH_EXERCISE_PRESETS = ["Squats", "Push-ups", "Pull-ups", "Dips"];

/**
 * Strava's activity types use different words than our own presets — Strava
 * says "Run", the challenge form says "Running" — and it has several variants
 * per sport ("TrailRun", "VirtualRide", "EBikeRide", …).
 *
 * Challenges compared `activity.type` to `challenge.exerciseType` directly,
 * which meant a synced Strava run could never satisfy a "Running" challenge:
 * every day read as zero and no milestone ever fired. Both sides now go
 * through `canonicalExerciseType` instead.
 *
 * Mapping at comparison time (rather than rewriting on sync) also fixes the
 * activities already stored, with no migration.
 */
const EXERCISE_TYPE_ALIASES: Record<string, string> = {
  run: "Running",
  trailrun: "Running",
  virtualrun: "Running",
  running: "Running",
  ride: "Cycling",
  virtualride: "Cycling",
  ebikeride: "Cycling",
  mountainbikeride: "Cycling",
  gravelride: "Cycling",
  handcycle: "Cycling",
  cycling: "Cycling",
  swim: "Swimming",
  swimming: "Swimming",
};

/**
 * Normalizes an activity/exercise type to the vocabulary used by
 * ENDURANCE_EXERCISE_PRESETS. Unknown types (including every strength preset,
 * which already matches by name) are returned unchanged apart from trimming,
 * so comparing two canonical values is always safe.
 */
export function canonicalExerciseType(type: string | null | undefined): string {
  if (!type) return "";
  const trimmed = type.trim();
  return EXERCISE_TYPE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * "reps"/"distanceMeters" sum the matching SportActivity metric across all of
 * that day's logged activities for exerciseType; "sessions" just requires at
 * least one activity of that type to have been logged that day.
 */
export type ChallengeMetric = "reps" | "distanceMeters" | "sessions";

export interface Challenge {
  id: string;
  title: string;
  exerciseType: string; // matches SportActivity.type, e.g. "Push-ups"
  metric: ChallengeMetric;
  dailyTarget: number; // e.g. 100 (reps/meters), or 1 for "sessions"
  durationDays: number; // e.g. 100
  startDate: string; // ISO date (YYYY-MM-DD), local
  createdAt: string;
  archived?: boolean;
}

export type NewChallenge = Omit<Challenge, "id" | "createdAt" | "archived">;

export interface ChallengeDayStatus {
  date: string; // YYYY-MM-DD
  completed: boolean;
  value: number;
}

export interface ChallengeProgress {
  days: ChallengeDayStatus[]; // startDate..min(today, endDate)
  currentStreak: number;
  longestStreak: number;
  completedCount: number;
  totalDaysSoFar: number;
  isFinished: boolean; // today is past startDate + durationDays
}

export interface ChallengeMilestone {
  thresholdPercent: number; // 25 | 50 | 75 | 100
  label: string;
  achieved: boolean;
}

export type IntegrationProvider =
  | "github"
  | "gitlab"
  | "google_calendar"
  | "strava"
  | "spotify";

export function isIntegrationProvider(value: unknown): value is IntegrationProvider {
  return (
    value === "github" ||
    value === "gitlab" ||
    value === "google_calendar" ||
    value === "strava" ||
    value === "spotify"
  );
}

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

/** "draft" takes precedence over "open"; merged/closed only show up briefly while a
 * synced task flips to done. */
export type PrState = "open" | "draft" | "merged" | "closed";
/** CI / pipeline rollup for the PR's head commit. "none" = no checks configured. */
export type PrCheckStatus = "success" | "failure" | "pending" | "none";
export type PrReviewDecision = "approved" | "changes_requested" | "review_required";

export interface DevPullRequest {
  provider: "github" | "gitlab";
  repo: string;
  number: number;
  title: string;
  url: string;
  isReviewRequested: boolean;
  isAuthor: boolean;
  createdAt?: string; // when the PR was opened (ISO)
  updatedAt: string;
  state: PrState;
  checks: PrCheckStatus;
  author: string; // author login
  isBot: boolean; // Dependabot / Renovate / any automated author
  reviewDecision?: PrReviewDecision; // GitHub only
  additions?: number;
  deletions?: number;
  labels?: string[];
  baseRef?: string; // branch the PR merges into
  headRef?: string; // branch the PR is from
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

export interface Reminder {
  id: string;
  title: string;
  note?: string; // e.g. "Referral code from a friend", linked account, or any other context
  deadline: string; // ISO datetime
  calendarEventId?: string; // set by the server once mirrored to Google Calendar
  recurrence?: Recurrence; // when set, deleting this reminder creates the next occurrence
  createdAt: string;
  updatedAt: string;
}

export type NewReminder = Omit<Reminder, "id" | "createdAt" | "updatedAt" | "calendarEventId">;

export type CoreCharacteristicId =
  | "discipline"
  | "fitness"
  | "craft"
  | "focus"
  | "social"
  | "rhythm"
  | "insight";
export type CharacteristicId = CoreCharacteristicId | TaskCategory;
export type CharacteristicSource = "computed" | "manual";
export type CharacteristicGroup = "core" | "category";

export interface CharacteristicDefinition {
  id: CharacteristicId;
  label: string;
  description: string;
  source: CharacteristicSource;
  group: CharacteristicGroup;
}

export const CHARACTERISTICS: CharacteristicDefinition[] = [
  {
    id: "discipline",
    label: "Discipline",
    description: "Grows as you complete tasks — harder tasks count for more.",
    source: "computed",
    group: "core",
  },
  {
    id: "fitness",
    label: "Fitness",
    description: "Grows with distance and sessions logged on Strava or manually.",
    source: "computed",
    group: "core",
  },
  {
    id: "craft",
    label: "Craft",
    description: "Grows with merged PRs and open work on GitHub/GitLab.",
    source: "computed",
    group: "core",
  },
  {
    id: "focus",
    label: "Focus",
    description: "Log a deep-work session to grow this.",
    source: "manual",
    group: "core",
  },
  {
    id: "social",
    label: "Social",
    description: "Log time well spent with people to grow this.",
    source: "manual",
    group: "core",
  },
  {
    id: "insight",
    label: "Insight",
    description: "Grows with Knowledge: daily lessons, correctly-solved drills, practiced words, and articles read.",
    source: "computed",
    group: "core",
  },
  {
    id: "rhythm",
    label: "Rhythm",
    description: "Grows with your recent Spotify listening — tracks played and variety of artists.",
    source: "computed",
    group: "core",
  },
  ...TASK_CATEGORIES.map(
    (category): CharacteristicDefinition => ({
      id: category.id,
      label: category.label,
      description: `Grows as you complete tasks tagged "${category.label}".`,
      source: "computed",
      group: "category",
    }),
  ),
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
  lastNote?: string;
  updatedAt: string;
}

export interface CharacteristicLevel {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-1, how far into the current level
}

// ---- Knowledge ----
// A self-built "third-party" learning feature: a daily AI-generated lesson,
// on-demand code-logic drills, a personal vocabulary list, and a reading list
// with AI-generated summaries. Lessons/drills/summaries are generated
// server-side (Vercel AI SDK) and written to Firestore by the server; the
// client only reads them plus writes its own vocab-mastery/reading-list state.

export interface DailyLesson {
  id: string; // the ISO date (YYYY-MM-DD) it was generated for, one per day
  codeConcept: string;
  codeExplanation: string;
  word: string;
  wordLanguage: "en" | "fr";
  wordDefinition: string;
  wordExample: string;
  articleTopic: string; // the real article's headline
  articleReason: string; // why this article was picked
  articleSource?: string; // the publication it came from, e.g. "Quanta Magazine"
  articleUrl?: string; // the real article's URL, picked from a curated set of science/tech RSS feeds
  createdAt: string;
}

export type CodeDrillDifficulty = "beginner" | "intermediate" | "advanced";

export interface CodeDrill {
  id: string;
  topic: string; // user-requested topic, or "random" if left blank
  difficulty: CodeDrillDifficulty;
  prompt: string; // the problem/question posed to the user
  explanation: string; // the concept explanation / model answer
  userAnswer?: string; // the learner's submitted answer, once graded
  graded?: boolean;
  score?: number; // 0-10, how well the answer demonstrated correct understanding
  correct?: boolean; // score >= 7
  feedback?: string; // AI feedback on the submitted answer
  hint?: string; // a specific, actionable hint — set when score < 7, cleared once passing
  videoUrl?: string; // a YouTube search-results link for the specific gap — set when score < 7, cleared once passing
  createdAt: string;
}

export type VocabMastery = "new" | "learning" | "known";

export interface VocabWord {
  id: string;
  word: string;
  definition: string;
  example: string;
  mastery: VocabMastery;
  practiceSentence?: string; // the learner's own sentence using the word, once graded
  practiceCorrect?: boolean;
  practiceFeedback?: string; // AI feedback on the practice sentence
  createdAt: string;
  updatedAt: string;
}

export interface ReadingListItem {
  id: string;
  url: string;
  title?: string;
  summary?: string; // filled in by the server once AI summarization completes
  keyTakeaways?: string[];
  status: "pending" | "summarized" | "read" | "error";
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewReadingListItem = Pick<ReadingListItem, "url">;

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string; // joined, e.g. "Tame Impala, Kevin Parker"
  albumArtUrl?: string;
  url: string;
  playedAt: string; // ISO datetime
  durationMs: number;
}

export interface SpotifyTopArtist {
  name: string;
  playCount: number;
}

export interface SpotifySummary {
  recentTracks: SpotifyTrack[];
  topArtists: SpotifyTopArtist[];
  /** Sum of recentTracks durations — a recent-window estimate, not lifetime listening time. */
  totalMinutesRecent: number;
  lastSyncAt: string;
}

export interface NowPlayingTrack {
  isPlaying: boolean;
  track?: {
    name: string;
    artists: string;
    albumArtUrl?: string;
    url: string;
    durationMs: number;
    progressMs: number;
  };
}

// ---- Push notifications ----

export type PushTokenPlatform = "expo" | "web";

export interface PushToken {
  id: string;
  platform: PushTokenPlatform;
  expoPushToken?: string; // set when platform === "expo"
  webSubscription?: { endpoint: string; keys: { p256dh: string; auth: string } }; // set when platform === "web"
  createdAt: string;
  /**
   * The device's IANA zone, refreshed on every registration so it follows the
   * user when they travel. Server crons reason about "today" in this zone
   * rather than the UTC one they actually run on. Absent for tokens written
   * before this field existed, and by a runtime without Intl.
   */
  timeZone?: string;
  /** Last registration, i.e. last app start on this device — distinct from createdAt, which a merge preserves. Used to pick the zone the user is actually in. */
  seenAt?: string;
}

// ---- Money ----

export type TransactionType = "expense" | "income";
export type TransactionCategory = "food" | "rent" | "subscription" | "transport" | "entertainment" | "other";

export const TRANSACTION_CATEGORIES: { id: TransactionCategory; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "rent", label: "Rent" },
  { id: "subscription", label: "Subscription" },
  { id: "transport", label: "Transport" },
  { id: "entertainment", label: "Entertainment" },
  { id: "other", label: "Other" },
];

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number; // always positive; type determines the sign
  category: TransactionCategory;
  note?: string;
  date: string; // ISO date
  recurrence?: Recurrence; // e.g. a subscription that charges monthly
  createdAt: string;
}

export type NewTransaction = Omit<Transaction, "id" | "createdAt">;

export interface Budget {
  id: string;
  category: TransactionCategory;
  monthlyLimit: number;
  createdAt: string;
}

export type NewBudget = Omit<Budget, "id" | "createdAt">;

export interface BudgetStatus {
  spent: number;
  limit: number;
  percent: number; // 0-1+, can exceed 1 when over budget
  remaining: number;
}

// ---- Vices (negative bonus / compensation mechanic) ----

export interface VicePreset {
  id: string;
  label: string;
  penaltyStat: CoreCharacteristicId;
  penaltyXp: number;
  compensatingTaskTitle: string;
}

export interface ViceLog {
  id: string;
  viceId: string;
  penaltyStat: CoreCharacteristicId;
  penaltyXp: number;
  compensatingTaskId?: string;
  compensated: boolean;
  createdAt: string;
}
