"use client";

import {
  type CodeDrill,
  type CodeDrillDifficulty,
  type DailyLesson,
  type DrillGradeResult,
  type GradeResult,
  type ReadingListItem,
  type VocabMastery,
  type VocabWord,
  computeInsightXp,
  dailyLessonStreak,
  deleteCodeDrill,
  gradeDrillAnswer,
  gradeVocabSentence,
  generateCodeDrill,
  generateDailyLesson,
  generateVocabWord,
  levelFromXp,
  requestReadingSummary,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { knowledgeApiClient } from "@/lib/knowledgeClient";

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

function DailyLessonSection() {
  const { user } = useAuth();
  const [lesson, setLesson] = useState<DailyLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    data.getTodayLesson(user.uid)
      .then(setLesson)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      setLesson(await generateDailyLesson(knowledgeApiClient));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate today's lesson");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Today" title="Daily Lesson" />
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : lesson ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border-2 border-foreground bg-surface p-4">
            <p className="font-mono text-xs font-bold text-primary uppercase">Code Concept</p>
            <p className="mt-1 font-bold">{lesson.codeConcept}</p>
            <p className="mt-1 text-sm text-muted">{lesson.codeExplanation}</p>
          </div>
          <div className="rounded-md border-2 border-foreground bg-surface p-4">
            <p className="font-mono text-xs font-bold text-primary uppercase">
              New Word{lesson.wordLanguage ? ` · ${lesson.wordLanguage.toUpperCase()}` : ""}
            </p>
            <p className="mt-1 font-bold">{lesson.word}</p>
            <p className="mt-1 text-sm text-muted">{lesson.wordDefinition}</p>
            <p className="mt-1 text-sm italic text-muted">&ldquo;{lesson.wordExample}&rdquo;</p>
          </div>
          <div className="rounded-md border-2 border-foreground bg-surface p-4">
            <p className="font-mono text-xs font-bold text-primary uppercase">Read About</p>
            {lesson.articleSource && (
              <p className="mt-1 font-mono text-[10px] font-bold text-muted uppercase">{lesson.articleSource}</p>
            )}
            <p className="mt-1 font-bold">{lesson.articleTopic}</p>
            <p className="mt-1 text-sm text-muted">{lesson.articleReason}</p>
            {lesson.articleUrl && (
              <a
                href={lesson.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-mono text-xs font-bold text-primary uppercase hover:underline"
              >
                Read the article →
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center">
          <p className="mb-3 text-sm text-muted">No lesson generated yet today.</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate today's lesson"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

const DIFFICULTIES: { id: CodeDrillDifficulty; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const RUN_TIMEOUT_MS = 3000;
const DEFAULT_SCRATCHPAD_CODE = "for (let i = 0; i < 5; i++) {\n  console.log(i);\n}";

interface RunOutcome {
  logs: string[];
  error: string | null;
}

/**
 * A Worker never touches the DOM and runs off the main thread, so an infinite
 * loop in the user's own snippet can be hard-killed via terminate() without
 * ever freezing the page — good enough isolation for "try your own JS", not
 * meant to run untrusted third-party code.
 */
function buildRunnerWorker(): Worker {
  const source = `
self.onmessage = (e) => {
  const logs = [];
  const stringify = (value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const capture = (...args) => { logs.push(args.map(stringify).join(" ")); };
  console.log = capture;
  console.error = capture;
  console.warn = capture;
  try {
    new Function(e.data)();
    self.postMessage({ logs, error: null });
  } catch (err) {
    self.postMessage({ logs, error: err instanceof Error ? err.message : String(err) });
  }
};
`;
  const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

function CodeRunner() {
  const [code, setCode] = useState(DEFAULT_SCRATCHPAD_CODE);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  function handleRun() {
    setRunning(true);
    setOutcome(null);
    setTimedOut(false);

    const worker = buildRunnerWorker();
    const timeout = setTimeout(() => {
      worker.terminate();
      setTimedOut(true);
      setRunning(false);
    }, RUN_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<RunOutcome>) => {
      clearTimeout(timeout);
      setOutcome(e.data);
      setRunning(false);
      worker.terminate();
    };
    worker.onerror = (e) => {
      clearTimeout(timeout);
      setOutcome({ logs: [], error: e.message });
      setRunning(false);
      worker.terminate();
    };
    worker.postMessage(code);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border-2 border-foreground/20 bg-background p-3">
      <p className="font-mono text-xs font-bold text-primary uppercase">Try it — JS/TS scratchpad</p>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        rows={6}
        className="w-full resize-y rounded-md border-2 border-foreground bg-surface px-3 py-2 font-mono text-sm outline-none focus:shadow-[2px_2px_0_0_var(--primary)]"
      />
      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="self-start rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
      >
        {running ? "Running…" : "Run"}
      </button>
      {(outcome || timedOut) && (
        <div className="rounded-md border-2 border-foreground/30 bg-black p-3 font-mono text-xs text-green-400">
          {timedOut && (
            <p className="text-amber-400">Timed out after {RUN_TIMEOUT_MS / 1000}s — possible infinite loop.</p>
          )}
          {outcome?.logs.length === 0 && !outcome.error && (
            <p className="text-white/50">(no output — try console.log(...))</p>
          )}
          {outcome?.logs.map((line, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          ))}
          {outcome?.error && <p className="text-red-400">{outcome.error}</p>}
        </div>
      )}
    </div>
  );
}

function DrillCard({
  drill,
  onSkip,
  skipping,
  onDelete,
  deleting,
}: {
  drill: CodeDrill;
  onSkip: () => void;
  skipping: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [showRunner, setShowRunner] = useState(false);
  const [answer, setAnswer] = useState(drill.userAnswer ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DrillGradeResult | null>(
    drill.graded
      ? {
          score: drill.score ?? (drill.correct ? 10 : 0),
          correct: Boolean(drill.correct),
          feedback: drill.feedback ?? "",
          hint: drill.hint,
          videoUrl: drill.videoUrl,
        }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await gradeDrillAnswer(knowledgeApiClient, drill.id, answer.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade your answer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold uppercase">
          {drill.difficulty}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">{drill.topic}</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="font-mono text-xs font-bold text-red-600 uppercase hover:underline disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold">{drill.prompt}</p>

      {!result && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer or explanation…"
            rows={3}
            className="w-full resize-y rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !answer.trim()}
              className="rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
            >
              {submitting ? "Grading…" : "Submit answer"}
            </button>
            {!revealed && (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="font-mono text-xs font-bold text-primary uppercase hover:underline"
              >
                Show answer instead
              </button>
            )}
            <button
              type="button"
              onClick={onSkip}
              disabled={skipping}
              className="ml-auto font-mono text-xs font-bold text-muted uppercase hover:underline disabled:opacity-50"
            >
              {skipping ? "Skipping…" : "Skip"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div
          className={`mt-2 rounded-md border-2 p-3 ${
            result.correct ? "border-green-600 bg-green-600/10" : "border-red-600 bg-red-600/10"
          }`}
        >
          <p className="font-mono text-xs font-bold uppercase">
            {result.correct ? "Correct" : "Not quite"} · {result.score}/10
          </p>
          <p className="mt-1 text-sm text-muted">{result.feedback}</p>
          {!result.correct && (result.hint || result.videoUrl) && (
            <div className="mt-3 flex flex-col gap-2 border-t-2 border-foreground/20 pt-3">
              <p className="font-mono text-xs font-bold text-primary uppercase">Need a hand?</p>
              {result.hint && <p className="text-sm text-muted">{result.hint}</p>}
              {result.videoUrl && (
                <a
                  href={result.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start font-mono text-xs font-bold text-primary uppercase hover:underline"
                >
                  Watch a video on this →
                </a>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-3 font-mono text-xs font-bold text-primary uppercase hover:underline"
          >
            Edit answer
          </button>
        </div>
      )}

      {(revealed || result) && (
        <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{drill.explanation}</p>
      )}

      <button
        type="button"
        onClick={() => setShowRunner((v) => !v)}
        className="mt-3 font-mono text-xs font-bold text-primary uppercase hover:underline"
      >
        {showRunner ? "Hide scratchpad" : "Try it in JS →"}
      </button>
      {showRunner && <CodeRunner />}
    </li>
  );
}

function PastDrillRow({
  drill,
  onDelete,
  deleting,
}: {
  drill: CodeDrill;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground/20 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{drill.prompt}</p>
        <p className="font-mono text-xs text-muted uppercase">
          {drill.difficulty} · {drill.topic}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {drill.graded ? (
          <span
            className={`rounded-full border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
              drill.correct ? "border-green-600 text-green-700" : "border-red-600 text-red-700"
            }`}
          >
            {typeof drill.score === "number" ? `${drill.score}/10` : drill.correct ? "Correct" : "Missed"}
          </span>
        ) : (
          <span className="font-mono text-[10px] font-bold text-muted uppercase">Skipped</span>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="font-mono text-[10px] font-bold text-red-600 uppercase hover:underline disabled:opacity-50"
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>
    </li>
  );
}

function CodeDrillsSection() {
  const { user } = useAuth();
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<CodeDrillDifficulty>("intermediate");
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeCodeDrills(user.uid, setDrills);
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateCodeDrill(knowledgeApiClient, { topic: topic.trim() || undefined, difficulty });
      setTopic("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a drill");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await deleteCodeDrill(knowledgeApiClient, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this drill");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Practice" title="Code Drills" />
      <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-3">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (optional) — e.g. recursion, closures, Big O…"
          className="min-w-0 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficulty(d.id)}
              className={`rounded-full border-2 border-foreground px-3 py-1 text-xs font-bold uppercase ${
                difficulty === d.id ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="ml-auto rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate drill"}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {drills[0] ? (
          <DrillCard
            key={drills[0].id}
            drill={drills[0]}
            onSkip={handleGenerate}
            skipping={generating}
            onDelete={() => handleDelete(drills[0]!.id)}
            deleting={deletingId === drills[0].id}
          />
        ) : (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No drills yet — generate your first one above.
          </li>
        )}
      </ul>
      {drills.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-bold text-muted uppercase">Past drills</p>
          <ul className="flex flex-col gap-2">
            {drills.slice(1, 9).map((d) => (
              <PastDrillRow key={d.id} drill={d} onDelete={() => handleDelete(d.id)} deleting={deletingId === d.id} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const MASTERY_ORDER: VocabMastery[] = ["new", "learning", "known"];
const MASTERY_LABEL: Record<VocabMastery, string> = { new: "New", learning: "Learning", known: "Known" };

function VocabCard({ w }: { w: VocabWord }) {
  const { user } = useAuth();
  const [sentence, setSentence] = useState(w.practiceSentence ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(
    w.practiceSentence ? { correct: Boolean(w.practiceCorrect), feedback: w.practiceFeedback ?? "" } : null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!sentence.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await gradeVocabSentence(knowledgeApiClient, w.id, sentence.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not grade your sentence");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{w.word}</p>
          <p className="text-sm text-muted">{w.definition}</p>
          <p className="mt-1 text-sm italic text-muted">&ldquo;{w.example}&rdquo;</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {MASTERY_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => user && data.setVocabMastery(user.uid, w.id, m)}
              className={`rounded-full border-2 border-foreground px-2 py-1 font-mono text-[10px] font-bold uppercase ${
                w.mastery === m ? "bg-accent" : ""
              }`}
            >
              {MASTERY_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t-2 border-foreground/10 pt-3">
        <p className="font-mono text-xs font-bold text-primary uppercase">Practice it</p>
        <input
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder={`Write a sentence using "${w.word}"…`}
          className="w-full rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !sentence.trim()}
          className="self-start rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Check my sentence"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div
            className={`rounded-md border-2 p-3 ${
              result.correct ? "border-green-600 bg-green-600/10" : "border-red-600 bg-red-600/10"
            }`}
          >
            <p className="font-mono text-xs font-bold uppercase">{result.correct ? "Nice, that works" : "Not quite"}</p>
            <p className="mt-1 text-sm text-muted">{result.feedback}</p>
          </div>
        )}
      </div>
    </li>
  );
}

function DictionaryEntry({ w }: { w: VocabWord }) {
  return (
    <li className="rounded-md border-2 border-foreground/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold">{w.word}</p>
        <span className="shrink-0 font-mono text-[10px] font-bold text-green-700 uppercase">Learned</span>
      </div>
      <p className="mt-1 text-sm text-muted">{w.definition}</p>
      {w.practiceSentence && <p className="mt-1 text-sm italic text-muted">&ldquo;{w.practiceSentence}&rdquo;</p>}
    </li>
  );
}

function VocabularySection() {
  const { user } = useAuth();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeVocabWords(user.uid, setWords);
  }, [user]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateVocabWord(knowledgeApiClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a new word");
    } finally {
      setGenerating(false);
    }
  }

  const activeWords = words.filter((w) => !w.practiceCorrect);
  const dictionaryWords = words
    .filter((w) => w.practiceCorrect)
    .slice()
    .sort((a, b) => a.word.localeCompare(b.word));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader eyebrow="Vocabulary" title="New Words" />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          {generating ? "Generating…" : "New word"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {activeWords.map((w) => (
          <VocabCard key={w.id} w={w} />
        ))}
        {activeWords.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            {words.length === 0
              ? "No words yet — get your first one above."
              : "All caught up — every word's in your dictionary. Get a new one above."}
          </li>
        )}
      </ul>

      {dictionaryWords.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t-2 border-foreground/10 pt-4">
          <SectionHeader eyebrow={`${dictionaryWords.length} learned`} title="Dictionary" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {dictionaryWords.map((w) => (
              <DictionaryEntry key={w.id} w={w} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReadingListSection() {
  const { user } = useAuth();
  const [items, setItems] = useState<ReadingListItem[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeReadingList(user.uid, setItems);
  }, [user]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await data.createReadingListItem(user.uid, { url: url.trim() });
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this link");
    } finally {
      setAdding(false);
    }
  }

  async function handleSummarize(itemId: string) {
    setSummarizingId(itemId);
    setError(null);
    try {
      await requestReadingSummary(knowledgeApiClient, itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not summarize this article");
    } finally {
      setSummarizingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Reading" title="Reading List" />
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to read later…"
          className="min-w-0 flex-1 rounded-md border-2 border-foreground bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <button
          type="submit"
          disabled={adding || !url.trim()}
          className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border-2 border-foreground bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.title ?? item.url}</p>
                <p className="truncate font-mono text-xs text-muted">{item.url}</p>
                {item.summary && <p className="mt-2 text-sm text-muted">{item.summary}</p>}
                {item.keyTakeaways && item.keyTakeaways.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-sm text-muted">
                    {item.keyTakeaways.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
                {item.status === "error" && <p className="mt-2 text-sm text-red-600">{item.error}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-[10px] font-bold text-muted uppercase">{item.status}</span>
                {(item.status === "pending" || item.status === "error") && (
                  <button
                    type="button"
                    onClick={() => handleSummarize(item.id)}
                    disabled={summarizingId === item.id}
                    className="rounded-md border-2 border-foreground px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20 disabled:opacity-50"
                  >
                    {summarizingId === item.id ? "Summarizing…" : "Summarize"}
                  </button>
                )}
                {item.status === "summarized" && (
                  <button
                    type="button"
                    onClick={() => user && data.markReadingListItemRead(user.uid, item.id)}
                    className="rounded-md border-2 border-foreground px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => user && data.deleteReadingListItem(user.uid, item.id)}
                  className="font-mono text-xs font-bold text-red-600 uppercase hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            Nothing on your reading list yet.
          </li>
        )}
      </ul>
    </section>
  );
}

export default function KnowledgeHomePage() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<DailyLesson[]>([]);
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [vocabWords, setVocabWords] = useState<VocabWord[]>([]);
  const [readingItems, setReadingItems] = useState<ReadingListItem[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      data.subscribeDailyLessons(user.uid, setLessons, undefined, 400),
      data.subscribeCodeDrills(user.uid, setDrills),
      data.subscribeVocabWords(user.uid, setVocabWords),
      data.subscribeReadingList(user.uid, setReadingItems),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  const insightLevel = levelFromXp(computeInsightXp(lessons, drills, vocabWords, readingItems));
  const streak = dailyLessonStreak(lessons);
  const firstName = user.displayName?.split(" ")[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-6 sm:p-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {firstName ? `${firstName}'s Knowledge` : "Knowledge"}
            </h1>
            <p className="text-sm text-muted">Your daily lesson, coding drills, vocab, and reading list.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {streak > 0 && (
              <span className="rounded-full border-2 border-foreground bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase">
                {streak}-day streak
              </span>
            )}
            <button
              type="button"
              onClick={() => signOutUser()}
              className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-md border-2 border-foreground bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">
              Insight · Level {insightLevel.level}
            </p>
            <p className="font-mono text-xs text-muted">
              {insightLevel.xpIntoLevel} / {insightLevel.xpForNextLevel} XP
            </p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border-2 border-foreground bg-background">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.max(0, insightLevel.progress * 100))}%` }}
            />
          </div>
        </div>
      </div>
      <DailyLessonSection />
      <CodeDrillsSection />
      <VocabularySection />
      <ReadingListSection />
    </main>
  );
}
