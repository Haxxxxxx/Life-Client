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

type RoastTiers = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** 0: level 1, 1: level 2, ... 9: level 10+. Ten tiers, one per line in a RoastTiers tuple. */
function roastTierIndex(level: number): number {
  return Math.min(Math.max(level, 1), 10) - 1;
}

/** Cheeky, level-tiered flavor text for each core stat — replaces the plain static description on the Profile page. */
const CORE_ROAST_TIERS: Record<CoreCharacteristicId, RoastTiers> = {
  discipline: [
    "Currently surviving on vibes and open browser tabs. Discipline: not detected.",
    "One (1) task closed. The bar was underground and you found it.",
    "Two tasks in a row?! Someone's discovering follow-through.",
    "A modest streak forming. Your to-do list looks almost intentional.",
    "Adulting is happening. Slowly, suspiciously, but happening.",
    "Tasks are falling like dominoes. Suspiciously competent behavior.",
    "Certified closer. Deadlines have started respecting you back.",
    "Discipline arc fully activated. Even Mondays fear you now.",
    "Borderline unstoppable. Your to-do list is basically a formality.",
    "Certified task-crushing machine — even your to-do list is scared of you.",
  ],
  fitness: [
    "Fitness level: houseplant. The houseplant moves more than you.",
    "One (1) walk to the fridge has been logged. Progress, technically.",
    "A jog happened. Briefly. It counted.",
    "Building real momentum — or at least a solid excuse to buy new shoes.",
    "Sweat is now a semi-regular occurrence. Respect.",
    "The gym bag has left the closet more than once this month.",
    "Certified gym-goer energy. The treadmill knows your name.",
    "Cardio's basically a personality trait at this point.",
    "PRs getting broken left and right. Who hurt you into this shape?",
    "Absolute unit. Your cardiovascular system sends its regards.",
  ],
  craft: [
    "Zero merged PRs. Are you a developer, or just cosplaying as one?",
    "One PR merged. Bold of you to call that a career.",
    "Two PRs deep. Reviewers are starting to recognize your name.",
    "Shipping code at a respectable, mildly caffeinated pace.",
    "Commits flowing steady. main branch mildly nervous.",
    "Merge-happy and dangerous. CI is sweating a little.",
    "Certified PR machine. Code review queue fears your arrival.",
    "Shipping features faster than product can write tickets.",
    "Borderline prolific. Even git blame is impressed.",
    "Certified ship-it legend — main trembles every time you push.",
  ],
  focus: [
    "Focus sessions logged: none. Attention span: goldfish-adjacent.",
    "One deep-work session — a shy first step out of notification hell.",
    "Two sessions down. Slack notifications mildly concerned.",
    "Building a real focus habit. Slack fears you slightly now.",
    "Deep work is becoming a Tuesday-Thursday thing. Nice.",
    "Do Not Disturb mode is basically a lifestyle choice now.",
    "Deep work regular. Distractions know better than to try.",
    "Flow state: frequent visitor. Almost a resident.",
    "Borderline monastic focus. Even silence respects your grind.",
    "Monk-level focus achieved. Silence itself asks YOU to keep it down.",
  ],
  social: [
    "Social battery still in the box, factory-sealed, never opened.",
    "One hangout logged. Baby's first step out of the cave.",
    "Two hangouts. A pattern may be forming — cautiously optimistic.",
    "Group chats are noticing you exist again. Big moment.",
    "Actively maintaining a social life — the group chat acknowledges you.",
    "Plans are happening AND you're showing up. Rare combo.",
    "Certified social butterfly. Plans just materialize around you.",
    "Your calendar has more hangouts than free evenings now.",
    "Borderline social coordinator. People check with you before planning.",
    "Main character of every group chat. People build their week around you.",
  ],
  insight: [
    "Knowledge XP: zero. Today's lesson is judging you quietly.",
    "One lesson down. Big-brain energy, still in its larval stage.",
    "Two lessons deep. Trivia night is cautiously interested in you.",
    "Steadily leveling up the brain — words learned, drills drilled.",
    "Vocabulary expanding. You've used a big word unironically.",
    "Drills getting crushed. The code concepts fear your growth.",
    "Certified knowledge sponge. Trivia night fears you.",
    "Reading list clearing faster than it refills. Rare feat.",
    "Borderline walking Wikipedia. People fact-check YOU now.",
    "Walking encyclopedia. The daily lesson has nothing left to teach you.",
  ],
  rhythm: [
    "Rhythm level: silence. Even the elevator has better taste right now.",
    "A few tracks played. Baby's first playlist, respectfully.",
    "Two sessions of actual listening. The algorithm is taking notes.",
    "Solid rotation going — the algorithm is starting to respect you.",
    "Your Discover Weekly is finally not embarrassing.",
    "Certified varied listener. Genres are getting nervous.",
    "Music taste developing real range. Spotify Wrapped incoming heat.",
    "Playlist game strong. Friends are asking for your Discover Weekly.",
    "Borderline musical tastemaker. People trust your recommendations now.",
    "Peak rhythm achieved. You ARE the algorithm at this point.",
  ],
};

/** A cheeky, level-aware line for a core stat — funnier and more alive than a static description. */
export function characteristicRoast(id: CoreCharacteristicId, level: number): string {
  return CORE_ROAST_TIERS[id][roastTierIndex(level)];
}

/** Same idea as CORE_ROAST_TIERS, one set of 10 lines per Task Category. */
const CATEGORY_ROAST_TIERS: Record<TaskCategory, RoastTiers> = {
  work: [
    "Zero work tasks closed. Are you even employed, or just vibing?",
    "One work task done. The bare minimum, technically achieved.",
    "Two tasks deep. Productivity theater, but real progress.",
    "Inbox anxiety decreasing. Slowly. Suspiciously.",
    "Work tasks clearing at a respectable, non-panicked pace.",
    "Certified functional employee. Meetings fear your agenda.",
    "Deadlines bending to your will. Manager mildly suspicious.",
    "Work mode: borderline unstoppable. Slack status permanently green.",
    "Promotion-track energy. HR is quietly taking notes.",
    "Certified workhorse. Your inbox has given up fighting back.",
  ],
  personal: [
    "Personal to-dos: untouched. Even you're avoiding yourself.",
    "One personal task done. Self-care, technically.",
    "Two down. Personal life showing faint signs of maintenance.",
    "Things are getting handled. Suspiciously adult behavior.",
    "Personal admin under control. Junk drawer still a mess though.",
    "Life admin: mostly handled. Future you says thanks.",
    "Certified together-having-it. Errands fear your calendar.",
    "Personal backlog nearly cleared. Who even are you.",
    "Borderline life-admin wizard. Even taxes seem manageable.",
    "Fully together human. Your personal life could be a TED talk.",
  ],
  health: [
    "Health tasks: zero. The doctor's appointment remains theoretical.",
    "One health task logged. A vitamin was taken, possibly.",
    "Two down. Body maintenance is now a known concept to you.",
    "Health habits forming. Water intake trending upward.",
    "Actually taking care of yourself. Wild concept, respectfully.",
    "Checkups scheduled AND attended. Rare combo unlocked.",
    "Certified health-conscious human. Meal prep containers stacked neat.",
    "Wellness routine dialed in. Even sleep schedule cooperating.",
    "Borderline health guru. Friends ask for your supplement stack.",
    "Peak wellness achieved. Your annual physical is basically a formality.",
  ],
  learning: [
    "Learning tasks: zero. The tutorial tab has been open for weeks.",
    "One learning task done. A single fact absorbed. Respect.",
    "Two down. The learning montage is quietly starting.",
    "Skills stacking up. Slowly, but they're stacking.",
    "Actual studying happening. Past you would be shocked.",
    "Certified lifelong learner. Courses actually get finished now.",
    "Knowledge compounding nicely. Certificates piling up.",
    "Borderline autodidact. You explain things unprompted now.",
    "Learning machine. New skills acquired faster than forgotten.",
    "Certified polymath in training. Google searches down 40%.",
  ],
  sport: [
    "Sport tasks: zero. The equipment remains pristine and untouched.",
    "One sport task logged. A ball was involved, allegedly.",
    "Two down. Competitive spirit flickering to life.",
    "Showing up consistently. The scoreboard's starting to notice.",
    "Game sense sharpening. Teammates trust the pass now.",
    "Certified regular. Your name's on the league sign-up sheet.",
    "Performance climbing. Opponents scouting you now, unfortunately for them.",
    "Borderline team captain energy. Huddles listen when you talk.",
    "Highlight-reel-adjacent. Someone clipped that last play.",
    "Certified sport menace. Rec league legend status achieved.",
  ],
  creativity: [
    "Creative tasks: zero. The blank canvas remains blank.",
    "One creative task done. A doodle happened. It counts.",
    "Two down. Ideas are starting to leak out sideways.",
    "Creative muscle waking up. Drafts outnumbering excuses now.",
    "Actual output happening. The muse showed up, mostly sober.",
    "Certified idea machine. Sketchbook filling up nicely.",
    "Creative streak undeniable. Inspiration's basically on retainer.",
    "Borderline prolific creator. People ask 'how do you make time.'",
    "Portfolio getting genuinely impressive. Imposter syndrome losing.",
    "Certified creative force. The muse works for YOU now.",
  ],
  endurance: [
    "Endurance tasks: zero. The couch cushion has your exact imprint.",
    "One endurance task logged. You went the distance. Briefly.",
    "Two down. Lungs cautiously optimistic about the future.",
    "Stamina building. The stairs are less of a personal attack now.",
    "Distance creeping up. Pace mildly less humiliating.",
    "Certified go-the-distance human. Second wind unlocked.",
    "Endurance climbing steadily. 'Just one more mile' hits different.",
    "Borderline iron-lunged. Hills have stopped winning.",
    "Marathon-brain activated. Suffering has become a hobby, respectfully.",
    "Certified endurance machine. Your resting heart rate is a personality trait.",
  ],
  self_work: [
    "Self-work tasks: zero. The journal remains a beautiful, empty prop.",
    "One self-work task done. A feeling was processed, allegedly.",
    "Two down. Self-reflection happening on purpose now.",
    "Inner work building momentum. Therapist mildly impressed.",
    "Actual growth happening. Old patterns getting side-eyed.",
    "Certified self-aware human. Journaling streak: suspiciously consistent.",
    "Self-work compounding nicely. Boundaries actually being enforced.",
    "Borderline enlightened. Reactions getting noticeably more chosen.",
    "Growth arc undeniable. Even your inner critic is impressed.",
    "Certified self-work sage. Your therapist wants to take notes from YOU.",
  ],
  code: [
    "Code tasks: zero. The IDE has become a screensaver.",
    "One code task done. Hello World, basically, but it shipped.",
    "Two down. Stack Overflow visits trending slightly downward.",
    "Code output building. Bugs still winning, but less often.",
    "Actual features shipping. Tests even passing, occasionally on purpose.",
    "Certified code-slinger. Refactors happening voluntarily now.",
    "Shipping steady and clean. Linter has nothing left to complain about.",
    "Borderline 10x developer, unofficially, allegedly, by vibes.",
    "Code quality climbing. Juniors are quietly copying your patterns.",
    "Certified code wizard. Bugs flee the codebase on sight.",
  ],
  reading: [
    "Reading tasks: zero. The bookmark hasn't moved in months.",
    "One reading task done. A page was turned. Momentum, technically.",
    "Two down. The 'to-read' pile has been glanced at threateningly.",
    "Pages turning steadily. Bookmark actually migrating now.",
    "Actual reading happening. Attention span making a comeback.",
    "Certified book-finisher. The pile is shrinking, not growing.",
    "Reading streak undeniable. Recommendations being handed out unprompted.",
    "Borderline bookworm. 'Just one more chapter' ruining bedtimes.",
    "Library-card energy at an all-time high. Goodreads goals crushed.",
    "Certified reading machine. The pile fears your presence now.",
  ],
};

/** A cheeky, level-aware line for a Task Category stat — mirrors characteristicRoast for core stats. */
export function taskCategoryRoast(category: TaskCategory, level: number): string {
  return CATEGORY_ROAST_TIERS[category][roastTierIndex(level)];
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
  note?: string;
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
      lastNote: input.note?.trim() ?? "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
