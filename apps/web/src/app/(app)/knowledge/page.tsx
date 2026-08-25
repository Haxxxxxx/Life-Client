"use client";

import {
  type CodeDrill,
  type CodeDrillDifficulty,
  type DailyLesson,
  type ReadingListItem,
  type VocabMastery,
  type VocabWord,
  createReadingListItem,
  deleteReadingListItem,
  generateCodeDrill,
  generateDailyLesson,
  generateVocabWord,
  getTodayLesson,
  markReadingListItemRead,
  requestReadingSummary,
  setVocabMastery,
  subscribeCodeDrills,
  subscribeReadingList,
  subscribeVocabWords,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
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
    if (!user || !db) return;
    getTodayLesson(db, user.uid)
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
            <p className="font-mono text-xs font-bold text-primary uppercase">New Word</p>
            <p className="mt-1 font-bold">{lesson.word}</p>
            <p className="mt-1 text-sm text-muted">{lesson.wordDefinition}</p>
            <p className="mt-1 text-sm italic text-muted">&ldquo;{lesson.wordExample}&rdquo;</p>
          </div>
          <div className="rounded-md border-2 border-foreground bg-surface p-4">
            <p className="font-mono text-xs font-bold text-primary uppercase">Read About</p>
            <p className="mt-1 font-bold">{lesson.articleTopic}</p>
            <p className="mt-1 text-sm text-muted">{lesson.articleReason}</p>
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

function DrillCard({ drill }: { drill: CodeDrill }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-1 font-mono text-xs font-bold uppercase">
          {drill.difficulty}
        </span>
        <span className="font-mono text-xs text-muted">{drill.topic}</span>
      </div>
      <p className="mt-2 text-sm font-bold">{drill.prompt}</p>
      {revealed ? (
        <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{drill.explanation}</p>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-2 font-mono text-xs font-bold text-primary uppercase hover:underline"
        >
          Show answer
        </button>
      )}
    </li>
  );
}

function CodeDrillsSection() {
  const { user } = useAuth();
  const [drills, setDrills] = useState<CodeDrill[]>([]);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<CodeDrillDifficulty>("intermediate");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCodeDrills(db, user.uid, setDrills);
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
        {drills.map((drill) => (
          <DrillCard key={drill.id} drill={drill} />
        ))}
        {drills.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No drills yet — generate your first one above.
          </li>
        )}
      </ul>
    </section>
  );
}

const MASTERY_ORDER: VocabMastery[] = ["new", "learning", "known"];
const MASTERY_LABEL: Record<VocabMastery, string> = { new: "New", learning: "Learning", known: "Known" };

function VocabularySection() {
  const { user } = useAuth();
  const [words, setWords] = useState<VocabWord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeVocabWords(db, user.uid, setWords);
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
        {words.map((w) => (
          <li key={w.id} className="rounded-md border-2 border-foreground bg-surface p-4">
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
                    onClick={() => user && db && setVocabMastery(db, user.uid, w.id, m)}
                    className={`rounded-full border-2 border-foreground px-2 py-1 font-mono text-[10px] font-bold uppercase ${
                      w.mastery === m ? "bg-accent" : ""
                    }`}
                  >
                    {MASTERY_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
        {words.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No words yet — get your first one above.
          </li>
        )}
      </ul>
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
    if (!user || !db) return;
    return subscribeReadingList(db, user.uid, setItems);
  }, [user]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !db || !url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createReadingListItem(db, user.uid, { url: url.trim() });
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
                    onClick={() => user && db && markReadingListItemRead(db, user.uid, item.id)}
                    className="rounded-md border-2 border-foreground px-2 py-1 font-mono text-xs font-bold uppercase hover:bg-accent/20"
                  >
                    Mark read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => user && db && deleteReadingListItem(db, user.uid, item.id)}
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

export default function KnowledgePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Grow</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Knowledge</h1>
        <p className="text-sm text-muted">
          A daily lesson, coding drills, new words, and articles worth reading — all AI-generated for you.
        </p>
      </div>
      <DailyLessonSection />
      <CodeDrillsSection />
      <VocabularySection />
      <ReadingListSection />
    </div>
  );
}
