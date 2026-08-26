import {
  type Firestore,
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  TASK_DIFFICULTY_XP,
  type CharacteristicId,
  type CharacteristicLevel,
  type CodeDrill,
  type CoreCharacteristicId,
  type DailyLesson,
  type DevActivitySummary,
  type ManualEventType,
  type ManualProgress,
  type ReadingListItem,
  type SportActivity,
  type SpotifySummary,
  type Task,
  type TaskCategory,
  type VocabWord,
} from "./types";

const XP_PER_KM = 10;
const XP_PER_ENDURANCE_SESSION = 5;
const XP_PER_REP = 1;
const XP_PER_SET_BONUS = 5;
const XP_PER_MERGED_PR = 25;
const XP_PER_OPEN_PR = 5;
const XP_PER_RECENT_TRACK = 2;
const XP_PER_UNIQUE_ARTIST = 6;
const XP_PER_DAILY_LESSON = 8;
const XP_PER_CORRECT_DRILL = 15;
const XP_PER_PRACTICED_WORD = 12;
const XP_PER_READ_ARTICLE = 6;

function completedTaskXp(task: Task): number {
  return TASK_DIFFICULTY_XP[task.difficulty ?? "medium"];
}

/** Linear level curve: level N -> N+1 costs 100*N xp. */
export function levelFromXp(totalXp: number): CharacteristicLevel {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let xpForNextLevel = 100 * level;

  while (remaining >= xpForNextLevel) {
    remaining -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 100 * level;
  }

  return {
    level,
    totalXp,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progress: remaining / xpForNextLevel,
  };
}

/** Cheeky, level-tiered flavor text for each core stat — replaces the plain static description on the Profile page. */
const CORE_ROAST_TIERS: Record<CoreCharacteristicId, [string, string, string, string]> = {
  discipline: [
    "Currently surviving on vibes and open browser tabs. Discipline: not detected.",
    "You closed a task. Groundbreaking. Do it again before the streak notices.",
    "Adulting is happening. Slowly, suspiciously, but happening.",
    "Certified task-crushing machine — even your to-do list is scared of you.",
  ],
  fitness: [
    "Fitness level: houseplant. The houseplant moves more than you.",
    "One (1) walk to the fridge has been logged. Progress, technically.",
    "Building real momentum — or at least a solid excuse to buy new shoes.",
    "Absolute unit. Your cardiovascular system sends its regards.",
  ],
  craft: [
    "Zero merged PRs. Are you a developer, or just cosplaying as one?",
    "One PR merged. Bold of you to call that a career.",
    "Shipping code at a respectable, mildly caffeinated pace.",
    "Certified ship-it legend — main trembles every time you push.",
  ],
  focus: [
    "Focus sessions logged: none. Attention span: goldfish-adjacent.",
    "One deep-work session — a shy first step out of notification hell.",
    "Building a real focus habit. Slack fears you slightly now.",
    "Monk-level focus achieved. Silence itself asks YOU to keep it down.",
  ],
  social: [
    "Social battery still in the box, factory-sealed, never opened.",
    "One hangout logged. Baby's first step out of the cave.",
    "Actively maintaining a social life — the group chat acknowledges you.",
    "Main character of every group chat. People build their week around you.",
  ],
  insight: [
    "Knowledge XP: zero. Today's lesson is judging you quietly.",
    "One lesson down. Big-brain energy, still in its larval stage.",
    "Steadily leveling up the brain — words learned, drills drilled.",
    "Walking encyclopedia. The daily lesson has nothing left to teach you.",
  ],
  rhythm: [
    "Rhythm level: silence. Even the elevator has better taste right now.",
    "A few tracks played. Baby's first playlist, respectfully.",
    "Solid rotation going — the algorithm is starting to respect you.",
    "Peak rhythm achieved. You ARE the algorithm at this point.",
  ],
};

/** 0: level<=1, 1: level 2-4, 2: level 5-9, 3: level 10+. */
function roastTierIndex(level: number): 0 | 1 | 2 | 3 {
  if (level <= 1) return 0;
  if (level <= 4) return 1;
  if (level <= 9) return 2;
  return 3;
}

/** A cheeky, level-aware line for a core stat — funnier and more alive than a static description. */
export function characteristicRoast(id: CoreCharacteristicId, level: number): string {
  return CORE_ROAST_TIERS[id][roastTierIndex(level)];
}

export function computeDisciplineXp(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + completedTaskXp(t), 0);
}

export function computeCategoryXp(tasks: Task[], category: TaskCategory): number {
  return tasks
    .filter((t) => t.status === "done" && t.category === category)
    .reduce((sum, t) => sum + completedTaskXp(t), 0);
}

export function computeFitnessXp(activities: SportActivity[]): number {
  return activities.reduce((sum, activity) => {
    if (activity.kind === "strength") {
      const reps = (activity.reps ?? 0) * (activity.sets ?? 1);
      return sum + reps * XP_PER_REP + (activity.sets ?? 1) * XP_PER_SET_BONUS;
    }
    const km = (activity.distanceMeters ?? 0) / 1000;
    return sum + Math.round(km * XP_PER_KM) + XP_PER_ENDURANCE_SESSION;
  }, 0);
}

export function computeCraftXp(
  github: DevActivitySummary | null,
  gitlab: DevActivitySummary | null,
): number {
  const merged = (github?.totalMergedCount ?? 0) + (gitlab?.totalMergedCount ?? 0);
  const open = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);
  return merged * XP_PER_MERGED_PR + open * XP_PER_OPEN_PR;
}

/** Rewards listening variety (unique artists) more than raw track count. */
export function computeRhythmXp(spotify: SpotifySummary | null): number {
  if (!spotify) return 0;
  const trackXp = spotify.recentTracks.length * XP_PER_RECENT_TRACK;
  const artistXp = spotify.topArtists.length * XP_PER_UNIQUE_ARTIST;
  return trackXp + artistXp;
}

/** Rewards actually engaging with Knowledge content (correct drills, practiced words, read articles) over just generating it. */
export function computeInsightXp(
  lessons: DailyLesson[],
  drills: CodeDrill[],
  vocabWords: VocabWord[],
  readingItems: ReadingListItem[],
): number {
  const lessonXp = lessons.length * XP_PER_DAILY_LESSON;
  const drillXp = drills.filter((d) => d.correct).length * XP_PER_CORRECT_DRILL;
  const vocabXp = vocabWords.filter((w) => w.practiceCorrect).length * XP_PER_PRACTICED_WORD;
  const articleXp = readingItems.filter((i) => i.status === "read").length * XP_PER_READ_ARTICLE;
  return lessonXp + drillXp + vocabXp + articleXp;
}

function manualProgressDoc(db: Firestore, uid: string, characteristicId: CharacteristicId) {
  return doc(db, "users", uid, "manualProgress", characteristicId);
}

export function subscribeManualProgress(
  db: Firestore,
  uid: string,
  characteristicId: CharacteristicId,
  onChange: (progress: ManualProgress | null) => void,
): () => void {
  return onSnapshot(manualProgressDoc(db, uid, characteristicId), (snapshot) => {
    onChange(snapshot.exists() ? (snapshot.data() as ManualProgress) : null);
  });
}

export interface ManualEventInput {
  eventType: ManualEventType;
  durationMinutes: number;
  peopleCount: number;
}

const EVENT_TYPE_MULTIPLIER: Record<ManualEventType, number> = {
  pro: 1.2,
  sport: 1.1,
  bar: 1,
  restaurant: 1,
  other: 1,
};

const XP_PER_MINUTE = 0.5;
const PEOPLE_BONUS_PER_HEAD = 0.15;
const MAX_PEOPLE_BONUS_HEADS = 8;

/** Modulates a session's XP by how long it ran, who else was there, and what kind of event it was. */
export function computeManualEventXp(input: ManualEventInput): number {
  const base = Math.max(0, input.durationMinutes) * XP_PER_MINUTE;
  const extraPeople = Math.min(Math.max(input.peopleCount - 1, 0), MAX_PEOPLE_BONUS_HEADS);
  const peopleMultiplier = 1 + extraPeople * PEOPLE_BONUS_PER_HEAD;
  const categoryMultiplier = EVENT_TYPE_MULTIPLIER[input.eventType];
  return Math.max(1, Math.round(base * peopleMultiplier * categoryMultiplier));
}

export async function logManualEvent(
  db: Firestore,
  uid: string,
  characteristicId: CharacteristicId,
  input: ManualEventInput,
): Promise<void> {
  const xp = computeManualEventXp(input);
  await setDoc(
    manualProgressDoc(db, uid, characteristicId),
    {
      characteristicId,
      sessionCount: increment(1),
      xp: increment(xp),
      lastEventType: input.eventType,
      lastDurationMinutes: input.durationMinutes,
      lastPeopleCount: input.peopleCount,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
