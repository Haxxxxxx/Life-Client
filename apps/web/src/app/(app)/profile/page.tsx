"use client";

import {
  CHARACTERISTICS,
  type CharacteristicDefinition,
  type CodeDrill,
  type CoreCharacteristicId,
  type DailyLesson,
  type DevActivitySummary,
  MANUAL_EVENT_TYPES,
  type ManualEventInput,
  type ManualEventType,
  type ManualProgress,
  type ReadingListItem,
  type SportActivity,
  type SpotifySummary,
  type Task,
  type TaskCategory,
  type ViceLog,
  type VocabWord,
  characteristicRoast,
  computeCategoryXp,
  computeCraftXp,
  computeDisciplineXp,
  computeFitnessXp,
  computeInsightXp,
  computeRhythmXp,
  computeVicePenalty,
  levelFromXp,
  taskCategoryRoast,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useState } from "react";
import { Button, Card, Eyebrow, PageHeader, ProgressBar } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

const EVENT_TYPE_LABEL = Object.fromEntries(MANUAL_EVENT_TYPES.map((t) => [t.id, t.label])) as Record<
  ManualEventType,
  string
>;

// Only Focus/Social are manually-logged core stats — give each a note prompt
// that actually means something instead of a generic "Notes" field.
const NOTE_PLACEHOLDER: Partial<Record<string, string>> = {
  focus: "What were you focused on?",
  social: "Who with?",
};

function LogEventForm({
  characteristicId,
  onSubmit,
}: {
  characteristicId: string;
  onSubmit: (input: ManualEventInput) => void;
}) {
  const [eventType, setEventType] = useState<ManualEventType>(MANUAL_EVENT_TYPES[0]!.id);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [peopleCount, setPeopleCount] = useState(1);
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ eventType, durationMinutes, peopleCount, note: note.trim() || undefined });
      }}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3"
    >
      <div className="flex gap-2">
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as ManualEventType)}
          className="flex-1 rounded-xl border border-border-strong bg-background px-2 py-1.5 text-xs"
        >
          {MANUAL_EVENT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          Minutes
          <input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full min-w-0 rounded-xl border border-border-strong bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          People
          <input
            type="number"
            min={1}
            value={peopleCount}
            onChange={(e) => setPeopleCount(Number(e.target.value))}
            className="w-full min-w-0 rounded-xl border border-border-strong bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={NOTE_PLACEHOLDER[characteristicId] ?? "Notes (optional)"}
        className="w-full rounded-xl border border-border-strong bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted"
      />
      <Button type="submit" size="sm">
        Log it
      </Button>
    </form>
  );
}

function CharacteristicCard({
  def,
  totalXp,
  manualProgress,
  onLogEvent,
}: {
  def: CharacteristicDefinition;
  totalXp: number;
  manualProgress?: ManualProgress | null;
  onLogEvent?: (input: ManualEventInput) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const level = levelFromXp(totalXp);
  const description =
    def.group === "core"
      ? characteristicRoast(def.id as CoreCharacteristicId, level.level)
      : taskCategoryRoast(def.id as TaskCategory, level.level);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{def.label}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border-strong bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold">
          Lv {level.level}
        </span>
      </div>
      <ProgressBar progress={level.progress} />
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted">
          {level.xpIntoLevel} / {level.xpForNextLevel} XP
        </p>
        {onLogEvent && !formOpen && (
          <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
            Log event
          </Button>
        )}
      </div>
      {manualProgress?.lastEventType && !formOpen && (
        <p className="font-mono text-xs text-muted">
          Last: {EVENT_TYPE_LABEL[manualProgress.lastEventType]} · {manualProgress.lastDurationMinutes}min ·{" "}
          {manualProgress.lastPeopleCount} {manualProgress.lastPeopleCount === 1 ? "person" : "people"}
          {manualProgress.lastNote ? ` · "${manualProgress.lastNote}"` : ""}
        </p>
      )}
      {onLogEvent && formOpen && (
        <LogEventForm
          characteristicId={def.id}
          onSubmit={(input) => {
            onLogEvent(input);
            setFormOpen(false);
          }}
        />
      )}
    </Card>
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
  const [spotify, setSpotify] = useState<SpotifySummary | null>(null);
  const [lessons, setLessons] = useState<DailyLesson[]>([]);
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [readingItems, setReadingItems] = useState<ReadingListItem[]>([]);
  const [viceLogs, setViceLogs] = useState<ViceLog[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeTasks(user.uid, setTasks),
      data.subscribeSportActivities(user.uid, setActivities),
      data.subscribeDevActivity(user.uid, "github", setGithub),
      data.subscribeDevActivity(user.uid, "gitlab", setGitlab),
      data.subscribeManualProgress(user.uid, "focus", setFocusProgress),
      data.subscribeManualProgress(user.uid, "social", setSocialProgress),
      data.subscribeSpotifySummary(user.uid, setSpotify),
      data.subscribeDailyLessons(user.uid, setLessons),
      data.subscribeCodeDrills(user.uid, setDrills),
      data.subscribeVocabWords(user.uid, setVocabWords),
      data.subscribeReadingList(user.uid, setReadingItems),
      data.subscribeViceLogs(user.uid, setViceLogs),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const manualProgressByCharacteristic: Record<string, ManualProgress | null> = {
    focus: focusProgress,
    social: socialProgress,
  };

  const rawCoreXp: Record<string, number> = {
    discipline: computeDisciplineXp(tasks),
    fitness: computeFitnessXp(activities),
    craft: computeCraftXp(github, gitlab),
    focus: focusProgress?.xp ?? 0,
    social: socialProgress?.xp ?? 0,
    rhythm: computeRhythmXp(spotify),
    insight: computeInsightXp(lessons, drills, vocabWords, readingItems),
  };

  // Uncompensated vice slips dock XP from whichever stat they're linked to —
  // completing the auto-created compensating Task refunds it (see advanceTaskStatus).
  const coreXp: Record<string, number> = Object.fromEntries(
    Object.entries(rawCoreXp).map(([id, xp]) => [
      id,
      Math.max(0, xp - computeVicePenalty(viceLogs, id as CoreCharacteristicId)),
    ]),
  );

  const xpByCharacteristic: Record<string, number> = Object.fromEntries(
    CHARACTERISTICS.map((def) => [
      def.id,
      def.group === "core" ? (coreXp[def.id] ?? 0) : computeCategoryXp(tasks, def.id as TaskCategory),
    ]),
  );

  const coreCharacteristics = CHARACTERISTICS.filter((c) => c.group === "core");
  const categoryCharacteristics = CHARACTERISTICS.filter((c) => c.group === "category");

  const memberSince = user?.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader eyebrow="You" title="Profile" />

      <Card className="flex items-center gap-4">
        {user?.photoURL && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full border border-border-strong"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{user?.displayName ?? "—"}</p>
          <p className="truncate text-sm text-muted">{user?.email}</p>
          {memberSince && (
            <p className="mt-1 font-mono text-xs text-muted uppercase">Member since {memberSince}</p>
          )}
        </div>
      </Card>

      <div>
        <Eyebrow className="mb-3">Core Stats</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {coreCharacteristics.map((def) => (
            <CharacteristicCard
              key={def.id}
              def={def}
              totalXp={xpByCharacteristic[def.id] ?? 0}
              manualProgress={manualProgressByCharacteristic[def.id]}
              onLogEvent={
                def.source === "manual" && user && db
                  ? (input) => data.logManualEvent(user.uid, def.id, input)
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div>
        <Eyebrow className="mb-3">Task Categories</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {categoryCharacteristics.map((def) => (
            <CharacteristicCard key={def.id} def={def} totalXp={xpByCharacteristic[def.id] ?? 0} />
          ))}
        </div>
      </div>
    </div>
  );
}
