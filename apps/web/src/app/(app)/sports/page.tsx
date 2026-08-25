"use client";

import {
  ENDURANCE_EXERCISE_PRESETS,
  STRENGTH_EXERCISE_PRESETS,
  type SportActivity,
  type SportActivityKind,
  createManualSportActivity,
  deleteSportActivity,
  subscribeSportActivities,
} from "@life-client/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

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

      <button
        type="button"
        onClick={() =>
          onSubmit({ kind, type: customType.trim() || type, distanceKm, durationMin, reps, sets, weightKg })
        }
        className="rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
      >
        Log it
      </button>
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
    if (!user || !db) return;
    return subscribeSportActivities(db, user.uid, (a) => {
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
    if (!user || !db) return;
    setError(null);
    try {
      await createManualSportActivity(db, user.uid, {
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Performance</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Sports</h1>
          <p className="text-sm text-muted">Synced from Strava, or logged by hand.</p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            Log activity
          </button>
        )}
      </div>

      {formOpen && <LogActivityForm onSubmit={handleLog} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

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
              {activity.provider === "manual" && user && db && (
                <button
                  type="button"
                  onClick={() => deleteSportActivity(db!, user.uid, activity.id)}
                  className="text-red-600 hover:underline"
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
