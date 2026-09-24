"use client";

import {
  ENDURANCE_EXERCISE_PRESETS,
  STRENGTH_EXERCISE_PRESETS,
  type Challenge,
  type ChallengeMetric,
  type SportActivity,
  type SportActivityKind,
  computeChallengeMilestones,
  computeChallengeProgress,
  createChallenge,
  updateChallenge,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, ErrorText, PageHeader, SectionHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

function formatDistance(meters?: number): string {
  if (!meters) return "—";
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function LogActivityForm({
  onSubmit,
}: {
  onSubmit: (input: {
    kind: SportActivityKind;
    type: string;
    distanceKm: number;
    durationMin: number;
    reps: number;
    sets: number;
    weightKg: number;
  }) => void;
}) {
  const [kind, setKind] = useState<SportActivityKind>("endurance");
  const [type, setType] = useState(ENDURANCE_EXERCISE_PRESETS[0]!);
  const [customType, setCustomType] = useState("");
  const [distanceKm, setDistanceKm] = useState(5);
  const [durationMin, setDurationMin] = useState(30);
  const [reps, setReps] = useState(15);
  const [sets, setSets] = useState(3);
  const [weightKg, setWeightKg] = useState(0);

  const presets = kind === "endurance" ? ENDURANCE_EXERCISE_PRESETS : STRENGTH_EXERCISE_PRESETS;

  function handleKindChange(nextKind: SportActivityKind) {
    setKind(nextKind);
    setCustomType("");
    setType(nextKind === "endurance" ? ENDURANCE_EXERCISE_PRESETS[0]! : STRENGTH_EXERCISE_PRESETS[0]!);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-dashed border-foreground/40 p-3">
      <div className="flex gap-2">
        {(["endurance", "strength"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleKindChange(k)}
            className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold uppercase ${
              kind === k ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {k === "endurance" ? "Endurance" : "Strength"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setType(p);
              setCustomType("");
            }}
            className={`rounded-full border-2 border-foreground px-2.5 py-1 text-xs ${
              type === p && !customType ? "bg-accent" : ""
            }`}
          >
            {p}
          </button>
        ))}
        <input
          value={customType}
          onChange={(e) => setCustomType(e.target.value)}
          placeholder="Or type your own…"
          className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs outline-none placeholder:text-muted"
        />
      </div>

      {kind === "endurance" ? (
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Distance (km)
            <input
              type="number"
              min={0}
              step={0.1}
              value={distanceKm}
              onChange={(e) => setDistanceKm(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Duration (min)
            <input
              type="number"
              min={0}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      ) : (
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Reps
            <input
              type="number"
              min={0}
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Sets
            <input
              type="number"
              min={0}
              value={sets}
              onChange={(e) => setSets(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Weight (kg)
            <input
              type="number"
              min={0}
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      <Button
        size="sm"
        onClick={() =>
          onSubmit({ kind, type: customType.trim() || type, distanceKm, durationMin, reps, sets, weightKg })
        }
      >
        Log it
      </Button>
    </div>
  );
}

const METRICS: { id: ChallengeMetric; label: string }[] = [
  { id: "reps", label: "Reps/day" },
  { id: "distanceMeters", label: "Distance/day" },
  { id: "sessions", label: "Session/day" },
];

// Distance-based sports (Running, Cycling, Swimming) only make sense as
// distance or session challenges — "100 days of 100 Running" (reps) doesn't.
// Strength sports only make sense as reps or session challenges.
const METRICS_FOR_KIND: Record<SportActivityKind, ChallengeMetric[]> = {
  endurance: ["distanceMeters", "sessions"],
  strength: ["reps", "sessions"],
};
const DEFAULT_METRIC_FOR_KIND: Record<SportActivityKind, ChallengeMetric> = {
  endurance: "distanceMeters",
  strength: "reps",
};
const DEFAULT_TARGET_FOR_METRIC: Record<ChallengeMetric, number> = {
  reps: 100,
  distanceMeters: 5, // km — converted to meters (Challenge.dailyTarget's storage unit) at submit
  sessions: 1,
};

function metricUnitLabel(metric: ChallengeMetric): string {
  return metric === "distanceMeters" ? "km" : metric === "sessions" ? "sessions" : "reps";
}

/** Formats a raw stored value (meters for distance, count otherwise) for display. */
function formatMetricValue(metric: ChallengeMetric, value: number): string {
  if (metric === "distanceMeters") {
    const km = value / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(2)}km`;
  }
  if (metric === "sessions") return `${value} ${value === 1 ? "session" : "sessions"}`;
  return `${value} reps`;
}

function buildChallengeTitle(durationDays: number, metric: ChallengeMetric, dailyTargetDisplay: number, type: string): string {
  if (metric === "sessions") return `${durationDays} Days of ${type}`;
  const target = dailyTargetDisplay % 1 === 0 ? dailyTargetDisplay.toFixed(0) : dailyTargetDisplay.toFixed(1);
  return `${durationDays} Days of ${target}${metric === "distanceMeters" ? "km" : ""} ${type}`;
}

function todayLocalDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function ChallengeForm({ onSubmit }: { onSubmit: (input: Parameters<typeof createChallenge>[2]) => void }) {
  const [kind, setKind] = useState<SportActivityKind>("endurance");
  const [exerciseType, setExerciseType] = useState(ENDURANCE_EXERCISE_PRESETS[0]!);
  const [customType, setCustomType] = useState("");
  const [metric, setMetric] = useState<ChallengeMetric>("distanceMeters");
  const [dailyTarget, setDailyTarget] = useState(DEFAULT_TARGET_FOR_METRIC.distanceMeters);
  const [durationDays, setDurationDays] = useState(100);
  const [startDate, setStartDate] = useState(todayLocalDate());

  const type = customType.trim() || exerciseType;
  const presets = kind === "endurance" ? ENDURANCE_EXERCISE_PRESETS : STRENGTH_EXERCISE_PRESETS;
  const availableMetrics = METRICS.filter((m) => METRICS_FOR_KIND[kind].includes(m.id));

  function handleKindChange(nextKind: SportActivityKind) {
    setKind(nextKind);
    setCustomType("");
    setExerciseType(nextKind === "endurance" ? ENDURANCE_EXERCISE_PRESETS[0]! : STRENGTH_EXERCISE_PRESETS[0]!);
    const nextMetric = DEFAULT_METRIC_FOR_KIND[nextKind];
    setMetric(nextMetric);
    setDailyTarget(DEFAULT_TARGET_FOR_METRIC[nextMetric]);
  }

  function handleMetricChange(nextMetric: ChallengeMetric) {
    setMetric(nextMetric);
    setDailyTarget(DEFAULT_TARGET_FOR_METRIC[nextMetric]);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-dashed border-foreground/40 p-3">
      <div className="flex gap-2">
        {(["endurance", "strength"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleKindChange(k)}
            className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold uppercase ${
              kind === k ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {k === "endurance" ? "Endurance" : "Strength"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setExerciseType(p);
              setCustomType("");
            }}
            className={`rounded-full border-2 border-foreground px-2.5 py-1 text-xs ${
              exerciseType === p && !customType ? "bg-accent" : ""
            }`}
          >
            {p}
          </button>
        ))}
        <input
          value={customType}
          onChange={(e) => setCustomType(e.target.value)}
          placeholder="Or type your own…"
          className="min-w-0 flex-1 rounded-full border-2 border-foreground bg-background px-2.5 py-1 text-xs outline-none placeholder:text-muted"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {availableMetrics.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => handleMetricChange(m.id)}
            className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold uppercase ${
              metric === m.id ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Daily target ({metricUnitLabel(metric)})
          <input
            type="number"
            min={metric === "distanceMeters" ? 0.1 : 1}
            step={metric === "distanceMeters" ? 0.1 : 1}
            value={dailyTarget}
            onChange={(e) => setDailyTarget(Number(e.target.value))}
            className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Duration (days)
          <input
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full min-w-0 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <Button
        size="sm"
        onClick={() =>
          onSubmit({
            title: buildChallengeTitle(durationDays, metric, dailyTarget, type),
            exerciseType: type,
            metric,
            dailyTarget: metric === "distanceMeters" ? Math.round(dailyTarget * 1000) : dailyTarget,
            durationDays,
            startDate,
          })
        }
      >
        Start challenge
      </Button>
    </div>
  );
}

function ChallengeCard({
  challenge,
  activities,
  onArchive,
  onDelete,
  onSave,
  onLogToday,
}: {
  challenge: Challenge;
  activities: SportActivity[];
  onArchive: () => void;
  onDelete: () => void;
  onSave: (patch: Parameters<typeof updateChallenge>[3]) => void;
  onLogToday: () => void;
}) {
  const progress = computeChallengeProgress(challenge, activities);
  const milestones = computeChallengeMilestones(challenge, progress);
  const today = todayLocalDate();
  const todayEntry = progress.days.find((d) => d.date === today);
  const canLogToday = !progress.isFinished && challenge.startDate <= today && !todayEntry?.completed;

  // Daily target is stored in canonical units (meters for distance); edited/displayed in km for readability.
  const dailyTargetToDisplay = (raw: number) => (challenge.metric === "distanceMeters" ? raw / 1000 : raw);
  const dailyTargetToStored = (display: number) => (challenge.metric === "distanceMeters" ? Math.round(display * 1000) : display);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(challenge.title);
  const [dailyTarget, setDailyTarget] = useState(String(dailyTargetToDisplay(challenge.dailyTarget)));
  const [durationDays, setDurationDays] = useState(String(challenge.durationDays));

  function startEdit() {
    setTitle(challenge.title);
    setDailyTarget(String(dailyTargetToDisplay(challenge.dailyTarget)));
    setDurationDays(String(challenge.durationDays));
    setEditing(true);
  }

  function save() {
    onSave({
      title: title.trim() || challenge.title,
      dailyTarget: Number(dailyTarget) ? dailyTargetToStored(Number(dailyTarget)) : challenge.dailyTarget,
      durationDays: Number(durationDays) || challenge.durationDays,
    });
    setEditing(false);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm font-bold"
            />
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Daily target ({metricUnitLabel(challenge.metric)})
                <input
                  type="number"
                  min={challenge.metric === "distanceMeters" ? 0.1 : 1}
                  step={challenge.metric === "distanceMeters" ? 0.1 : 1}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(e.target.value)}
                  className="w-28 rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Duration (days)
                <input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-28 rounded-md border-2 border-foreground bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={save} className="font-mono text-xs font-bold text-primary uppercase hover:underline">
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="font-mono text-xs font-bold text-muted uppercase hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startEdit} className="text-left">
            <p className="font-bold hover:underline">{challenge.title}</p>
            <p className="text-xs text-muted">
              {challenge.exerciseType} · {formatMetricValue(challenge.metric, challenge.dailyTarget)}/day
            </p>
          </button>
        )}
        {!editing && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onArchive}
              className="font-mono text-xs font-bold text-muted uppercase hover:underline"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="font-mono text-xs font-bold text-danger uppercase hover:underline"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-2xl font-bold text-primary">{progress.currentStreak}</p>
          <p className="font-mono text-xs text-muted uppercase">current streak</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{progress.longestStreak}</p>
          <p className="font-mono text-xs text-muted uppercase">longest streak</p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            {progress.completedCount}/{challenge.durationDays}
          </p>
          <p className="font-mono text-xs text-muted uppercase">days completed</p>
        </div>
        {progress.isFinished && (
          <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold uppercase">
            Finished
          </span>
        )}
        {canLogToday && (
          <Button size="sm" className="ml-auto" onClick={onLogToday}>
            Log today
          </Button>
        )}
        {!progress.isFinished && todayEntry?.completed && (
          <span className="ml-auto rounded-full border-2 border-foreground bg-primary px-2.5 py-1 font-mono text-xs font-bold text-primary-foreground uppercase">
            Done today
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {milestones.map((m) => (
          <span
            key={m.thresholdPercent}
            className={`rounded-full border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              m.achieved ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30 text-muted"
            }`}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {progress.days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${formatMetricValue(challenge.metric, day.value)}`}
            className={`h-3 w-3 rounded-sm border ${
              day.completed ? "border-primary bg-primary" : "border-foreground/30 bg-background"
            }`}
          />
        ))}
      </div>
    </Card>
  );
}

function ChallengesSection({ activities }: { activities: SportActivity[] }) {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeChallenges(user.uid, setChallenges, (err) => setError(err.message));
  }, [user]);

  async function handleCreate(input: Parameters<typeof createChallenge>[2]) {
    if (!user) return;
    setError(null);
    try {
      await data.createChallenge(user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start challenge");
    }
  }

  // Logs an activity that matches this challenge's own exerciseType/metric —
  // avoids the user having to guess the exact type string themselves.
  async function handleLogToday(challenge: Challenge) {
    if (!user) return;
    setError(null);
    const kind: SportActivityKind = challenge.metric === "distanceMeters" ? "endurance" : "strength";
    try {
      await data.createManualSportActivity(user.uid, {
        kind,
        type: challenge.exerciseType,
        name: challenge.exerciseType,
        startDate: new Date().toISOString(),
        ...(kind === "endurance"
          ? { distanceMeters: challenge.dailyTarget }
          : { reps: challenge.metric === "reps" ? challenge.dailyTarget : 1, sets: 1 }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log today");
    }
  }

  const activeChallenges = challenges.filter((c) => !c.archived);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        eyebrow="Streaks"
        title="Challenges"
        action={
          !formOpen && (
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
              New challenge
            </Button>
          )
        }
      />
      {formOpen && <ChallengeForm onSubmit={handleCreate} />}
      <ErrorText>{error}</ErrorText>
      {activeChallenges.length > 0 ? (
        <div className="flex flex-col gap-3">
          {activeChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              activities={activities}
              onArchive={() => user && data.archiveChallenge(user.uid, challenge.id)}
              onDelete={() => user && data.deleteChallenge(user.uid, challenge.id)}
              onSave={(patch) => user && data.updateChallenge(user.uid, challenge.id, patch)}
              onLogToday={() => handleLogToday(challenge)}
            />
          ))}
        </div>
      ) : (
        !formOpen && (
          <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center text-sm text-muted">
            No active challenges — e.g. &ldquo;100 days of 100 push-ups&rdquo;. Completion is tracked automatically
            from activities you log below.
          </div>
        )
      )}
    </div>
  );
}

export default function SportsPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeSportActivities(user.uid, (a) => {
      setActivities(a);
      setLoaded(true);
    });
  }, [user]);

  async function handleLog(input: {
    kind: SportActivityKind;
    type: string;
    distanceKm: number;
    durationMin: number;
    reps: number;
    sets: number;
    weightKg: number;
  }) {
    if (!user) return;
    setError(null);
    try {
      await data.createManualSportActivity(user.uid, {
        kind: input.kind,
        type: input.type,
        name: input.type,
        startDate: new Date().toISOString(),
        ...(input.kind === "endurance"
          ? { distanceMeters: input.distanceKm * 1000, movingTimeSec: input.durationMin * 60 }
          : { reps: input.reps, sets: input.sets, weightKg: input.weightKg || undefined }),
      });
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log activity");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Performance"
        title="Sports"
        description="Synced from Strava, or logged by hand."
        action={
          !formOpen && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              Log activity
            </Button>
          )
        }
      />

      {formOpen && <LogActivityForm onSubmit={handleLog} />}
      <ErrorText>{error}</ErrorText>

      <ChallengesSection activities={activities} />

      {loaded && activities.length === 0 && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center text-sm text-muted">
          No activities yet.{" "}
          <Link href="/integrations" className="font-bold text-primary hover:underline">
            Connect Strava
          </Link>{" "}
          or log one by hand above.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{activity.name}</p>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">
                {activity.type} · {new Date(activity.startDate).toLocaleDateString()} ·{" "}
                {activity.provider === "manual" ? "Manual" : "Strava"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-right font-mono text-xs">
              {activity.kind === "strength" ? (
                <div>
                  <p className="font-bold text-primary">
                    {activity.reps ?? 0} × {activity.sets ?? 1}
                    {activity.weightKg ? ` · ${activity.weightKg}kg` : ""}
                  </p>
                  <p className="text-muted">reps × sets</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-bold text-primary">{formatDistance(activity.distanceMeters)}</p>
                    <p className="text-muted">distance</p>
                  </div>
                  <div>
                    <p className="font-bold text-primary">{formatDuration(activity.movingTimeSec)}</p>
                    <p className="text-muted">time</p>
                  </div>
                </>
              )}
              {activity.provider === "manual" && user && (
                <button
                  type="button"
                  onClick={() => data.deleteSportActivity(user.uid, activity.id)}
                  className="text-danger hover:underline"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
