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
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Eyebrow,
  Input,
  PageHeader,
  ProgressBar,
  SectionHeader,
  Textarea,
} from "@/components/ui";
import { ProgressCharts } from "@/components/charts";
import { useAuth } from "@/lib/auth-context";
import { knowledgeApiClient } from "@/lib/knowledgeClient";

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
          <Card>
            <p className="font-mono text-xs font-bold text-primary uppercase">Code Concept</p>
            <p className="mt-1 font-bold">{lesson.codeConcept}</p>
            <p className="mt-1 text-sm text-muted">{lesson.codeExplanation}</p>
          </Card>
          <Card>
            <p className="font-mono text-xs font-bold text-primary uppercase">
              New Word{lesson.wordLanguage ? ` · ${lesson.wordLanguage.toUpperCase()}` : ""}
            </p>
            <p className="mt-1 font-bold">{lesson.word}</p>
            <p className="mt-1 text-sm text-muted">{lesson.wordDefinition}</p>
            <p className="mt-1 text-sm italic text-muted">&ldquo;{lesson.wordExample}&rdquo;</p>
          </Card>
          <Card>
            <p className="font-mono text-xs font-bold text-primary uppercase">Read About</p>
            {lesson.articleSource && (
              <p className="mt-1 font-mono text-micro font-bold text-muted uppercase">{lesson.articleSource}</p>
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
          </Card>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
          <p className="mb-3 text-sm text-muted">No lesson generated yet today.</p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate today's lesson"}
          </Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
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
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <p className="font-mono text-xs font-bold text-primary uppercase">Try it — JS/TS scratchpad</p>
      <Textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        rows={6}
        className="bg-surface font-mono"
      />
      <Button size="sm" className="self-start" onClick={handleRun} disabled={running}>
        {running ? "Running…" : "Run"}
      </Button>
      {(outcome || timedOut) && (
        <div className="rounded-xl border border-border bg-black p-3 font-mono text-xs text-green-400">
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
    <li className="rounded-xl border border-border-strong bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-border-strong bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold uppercase">
          {drill.difficulty}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted">{drill.topic}</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="font-mono text-xs font-bold text-danger uppercase hover:underline disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold">{drill.prompt}</p>

      {!result && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer or explanation…"
            rows={3}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSubmit} disabled={submitting || !answer.trim()}>
              {submitting ? "Grading…" : "Submit answer"}
            </Button>
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

      <ErrorText className="mt-2">{error}</ErrorText>

      {result && (
        <div
          className={`mt-2 rounded-xl border p-3 ${
            result.correct ? "border-success bg-success/10" : "border-danger bg-danger/10"
          }`}
        >
          <p className="font-mono text-xs font-bold uppercase">
            {result.correct ? "Correct" : "Not quite"} · {result.score}/10
          </p>
          <p className="mt-1 text-sm text-muted">{result.feedback}</p>
          {!result.correct && (result.hint || result.videoUrl) && (
            <div className="mt-3 flex flex-col gap-2 border-t-2 border-border pt-3">
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
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{drill.prompt}</p>
        <p className="font-mono text-xs text-muted uppercase">
          {drill.difficulty} · {drill.topic}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {drill.graded ? (
          <Badge tone={drill.correct ? "success" : "danger"}>
            {typeof drill.score === "number" ? `${drill.score}/10` : drill.correct ? "Correct" : "Missed"}
          </Badge>
        ) : (
          <span className="font-mono text-micro font-bold text-muted uppercase">Skipped</span>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="font-mono text-micro font-bold text-danger uppercase hover:underline disabled:opacity-50"
        >
          {deleting ? "…" : "Delete"}
        </button>
      </div>
    </li>
  );
}

function CodeDrillsSection({ drills }: { drills: CodeDrill[] }) {
  // Rows come from the page, which already subscribes to this collection to
  // compute Insight XP and feed the charts. Subscribing again here opened a
  // second Firestore listener over the same documents — double the reads,
  // and two copies of the same state that could briefly disagree, so the
  // XP header and this list could be showing different data at once.
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<CodeDrillDifficulty>("intermediate");
  const [generating, setGenerating] = useState(false);
  // A Set, not a single id. With one slot, starting a second delete replaced
  // the first id — re-enabling the first row's button while its request was
  // still in flight — and whichever request settled first cleared the guard
  // for the other one too.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
    if (deletingIds.has(id)) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    setError(null);
    try {
      await deleteCodeDrill(knowledgeApiClient, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this drill");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Practice" title="Code Drills" />
      <Card padding="sm" className="flex flex-col gap-2">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (optional) — e.g. recursion, closures, Big O…"
          className="min-w-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficulty(d.id)}
              className={`rounded-full border border-border-strong px-3 py-1 text-xs font-bold uppercase ${
                difficulty === d.id ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {d.label}
            </button>
          ))}
          <Button size="sm" className="ml-auto" onClick={handleGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate drill"}
          </Button>
        </div>
      </Card>
      <ErrorText>{error}</ErrorText>
      <ul className="flex flex-col gap-2">
        {drills[0] ? (
          <DrillCard
            key={drills[0].id}
            drill={drills[0]}
            onSkip={handleGenerate}
            skipping={generating}
            onDelete={() => handleDelete(drills[0]!.id)}
            deleting={deletingIds.has(drills[0].id)}
          />
        ) : (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No drills yet — generate your first one above.
          </li>
        )}
      </ul>
      {drills.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-bold text-muted uppercase">Past drills</p>
          <ul className="flex flex-col gap-2">
            {drills.slice(1, 9).map((d) => (
              <PastDrillRow key={d.id} drill={d} onDelete={() => handleDelete(d.id)} deleting={deletingIds.has(d.id)} />
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
    <li className="rounded-xl border border-border-strong bg-surface p-4">
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
              className={`rounded-full border border-border-strong px-2 py-1 font-mono text-micro font-bold uppercase ${
                w.mastery === m ? "bg-primary/15" : ""
              }`}
            >
              {MASTERY_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 border-t-2 border-border pt-3">
        <p className="font-mono text-xs font-bold text-primary uppercase">Practice it</p>
        <Input
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder={`Write a sentence using "${w.word}"…`}
        />
        <Button size="sm" className="self-start" onClick={handleSubmit} disabled={submitting || !sentence.trim()}>
          {submitting ? "Checking…" : "Check my sentence"}
        </Button>
        <ErrorText>{error}</ErrorText>
        {result && (
          <div
            className={`rounded-xl border p-3 ${
              result.correct ? "border-success bg-success/10" : "border-danger bg-danger/10"
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
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold">{w.word}</p>
        <span className="shrink-0 font-mono text-micro font-bold text-success uppercase">Learned</span>
      </div>
      <p className="mt-1 text-sm text-muted">{w.definition}</p>
      {w.practiceSentence && <p className="mt-1 text-sm italic text-muted">&ldquo;{w.practiceSentence}&rdquo;</p>}
    </li>
  );
}

function VocabularySection({ words }: { words: VocabWord[] }) {
  // Rows come from the page, which already subscribes to this collection to
  // compute Insight XP and feed the charts. Subscribing again here opened a
  // second Firestore listener over the same documents — double the reads,
  // and two copies of the same state that could briefly disagree, so the
  // XP header and this list could be showing different data at once.
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? "Generating…" : "New word"}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="flex flex-col gap-2">
        {activeWords.map((w) => (
          <VocabCard key={w.id} w={w} />
        ))}
        {activeWords.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            {words.length === 0
              ? "No words yet — get your first one above."
              : "All caught up — every word's in your dictionary. Get a new one above."}
          </li>
        )}
      </ul>

      {dictionaryWords.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 border-t-2 border-border pt-4">
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

function ReadingListSection({ items }: { items: ReadingListItem[] }) {
  // Rows come from the page, which already subscribes to this collection to
  // compute Insight XP and feed the charts. Subscribing again here opened a
  // second Firestore listener over the same documents — double the reads,
  // and two copies of the same state that could briefly disagree, so the
  // XP header and this list could be showing different data at once.
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  // See the drill list: a single in-flight slot let a second Summarize
  // re-enable the first item's button mid-request, and duplicate clicks meant
  // duplicate paid LLM calls and duplicate writes.
  const [summarizingIds, setSummarizingIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
    if (summarizingIds.has(itemId)) return;
    setSummarizingIds((prev) => new Set(prev).add(itemId));
    setError(null);
    try {
      await requestReadingSummary(knowledgeApiClient, itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not summarize this article");
    } finally {
      setSummarizingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader eyebrow="Reading" title="Reading List" />
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to read later…"
          className="min-w-0 flex-1 bg-surface"
        />
        <Button type="submit" disabled={adding || !url.trim()}>
          Add
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border-strong bg-surface p-4">
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
                {item.status === "error" && <p className="mt-2 text-sm text-danger">{item.error}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-micro font-bold text-muted uppercase">{item.status}</span>
                {(item.status === "pending" || item.status === "error") && (
                  <button
                    type="button"
                    onClick={() => handleSummarize(item.id)}
                    disabled={summarizingIds.has(item.id)}
                    className="rounded-xl border border-border-strong px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-primary/10 disabled:opacity-50"
                  >
                    {summarizingIds.has(item.id) ? "Summarizing…" : "Summarize"}
                  </button>
                )}
                {item.status === "summarized" && (
                  <button
                    type="button"
                    onClick={() => user && data.markReadingListItemRead(user.uid, item.id)}
                    className="rounded-xl border border-border-strong px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-primary/10"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => user && data.deleteReadingListItem(user.uid, item.id)}
                  className="font-mono text-xs font-bold text-danger uppercase hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
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
      data.subscribeDailyLessons(user.uid, setLessons),
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
        <PageHeader
          eyebrow="Home"
          title={firstName ? `${firstName}'s Knowledge` : "Knowledge"}
          description="Your daily lesson, coding drills, vocab, and reading list."
          action={
            <div className="flex shrink-0 items-center gap-2">
              {streak > 0 && (
                <span className="rounded-full border border-border-strong bg-primary/15 px-3 py-1.5 font-mono text-xs font-bold uppercase">
                  {streak}-day streak
                </span>
              )}
              <Button variant="secondary" size="sm" onClick={() => signOutUser()}>
                Sign out
              </Button>
            </div>
          }
        />
        <Card className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Eyebrow>Insight · Level {insightLevel.level}</Eyebrow>
            <p className="font-mono text-xs text-muted">
              {insightLevel.xpIntoLevel} / {insightLevel.xpForNextLevel} XP
            </p>
          </div>
          <ProgressBar progress={insightLevel.progress} />
        </Card>
      </div>
      <ProgressCharts lessons={lessons} drills={drills} words={vocabWords} readingItems={readingItems} />
      <DailyLessonSection />
      <CodeDrillsSection drills={drills} />
      <VocabularySection words={vocabWords} />
      <ReadingListSection items={readingItems} />
    </main>
  );
}
