"use client";

import {
  CHARACTERISTICS,
  type CharacteristicDefinition,
  type DevActivitySummary,
  type ManualProgress,
  type SportActivity,
  type Task,
  computeCraftXp,
  computeDisciplineXp,
  computeFitnessXp,
  levelFromXp,
  logManualSession,
  subscribeDevActivity,
  subscribeManualProgress,
  subscribeSportActivities,
  subscribeTasks,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-surface">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function CharacteristicCard({
  def,
  totalXp,
  onLogSession,
}: {
  def: CharacteristicDefinition;
  totalXp: number;
  onLogSession?: () => void;
}) {
  const level = levelFromXp(totalXp);
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{def.label}</p>
          <p className="text-xs text-muted">{def.description}</p>
        </div>
        <span className="shrink-0 rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold">
          Lv {level.level}
        </span>
      </div>
      <ProgressBar progress={level.progress} />
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted">
          {level.xpIntoLevel} / {level.xpForNextLevel} XP
        </p>
        {onLogSession && (
          <button
            type="button"
            onClick={onLogSession}
            className="rounded-md border-2 border-foreground bg-primary px-3 py-1 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
          >
            +1 session
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);
  const [focusProgress, setFocusProgress] = useState<ManualProgress | null>(null);
  const [socialProgress, setSocialProgress] = useState<ManualProgress | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeSportActivities(db, user.uid, setActivities),
      subscribeDevActivity(db, user.uid, "github", setGithub),
      subscribeDevActivity(db, user.uid, "gitlab", setGitlab),
      subscribeManualProgress(db, user.uid, "focus", setFocusProgress),
      subscribeManualProgress(db, user.uid, "social", setSocialProgress),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const xpByCharacteristic: Record<string, number> = {
    discipline: computeDisciplineXp(tasks),
    fitness: computeFitnessXp(activities),
    craft: computeCraftXp(github, gitlab),
    focus: focusProgress?.xp ?? 0,
    social: socialProgress?.xp ?? 0,
  };

  const memberSince = user?.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">You</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Profile</h1>
      </div>

      <div className="flex items-center gap-4 rounded-md border-2 border-foreground bg-surface p-4">
        {user?.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="h-16 w-16 rounded-full border-2 border-foreground"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{user?.displayName ?? "—"}</p>
          <p className="truncate text-sm text-muted">{user?.email}</p>
          {memberSince && (
            <p className="mt-1 font-mono text-xs text-muted uppercase">Member since {memberSince}</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">
          Life Stats
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHARACTERISTICS.map((def) => (
            <CharacteristicCard
              key={def.id}
              def={def}
              totalXp={xpByCharacteristic[def.id] ?? 0}
              onLogSession={
                def.source === "manual" && user && db
                  ? () => logManualSession(db!, user.uid, def.id)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
