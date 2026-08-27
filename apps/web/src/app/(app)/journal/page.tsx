"use client";

import {
  JOURNAL_MOODS,
  createJournalEntry,
  deleteJournalEntry,
  subscribeJournalEntries,
  updateJournalEntry,
  type JournalEntry,
  type JournalMood,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

const MOOD_EMOJI = Object.fromEntries(JOURNAL_MOODS.map((m) => [m.id, m.emoji])) as Record<JournalMood, string>;

function MoodPicker({ value, onChange }: { value: JournalMood | undefined; onChange: (mood: JournalMood | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {JOURNAL_MOODS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(value === m.id ? undefined : m.id)}
          className={`rounded-full border-2 px-3 py-1.5 text-sm ${
            value === m.id ? "border-foreground bg-accent" : "border-foreground/30"
          }`}
        >
          {m.emoji} {m.label}
        </button>
      ))}
    </div>
  );
}

function EditEntryForm({
  entry,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  onSave: (patch: { content: string; mood?: JournalMood }) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState(entry.content);
  const [mood, setMood] = useState<JournalMood | undefined>(entry.mood);

  return (
    <div className="flex flex-1 flex-col gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none"
      />
      <MoodPicker value={mood} onChange={setMood} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSave({ content: content.trim() || entry.content, mood })}
          className="font-mono text-xs font-bold text-primary uppercase hover:underline"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="font-mono text-xs font-bold text-muted uppercase hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<JournalMood | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeJournalEntries(db, user.uid, setEntries, (err) => setError(err.message));
  }, [user]);

  async function handleAdd() {
    if (!user || !db || !content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createJournalEntry(db, user.uid, { content: content.trim(), mood });
      setContent("");
      setMood(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save entry");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(entryId: string, patch: { content: string; mood?: JournalMood }) {
    if (!user || !db) return;
    try {
      await updateJournalEntry(db, user.uid, entryId, patch);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update entry");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Journal</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Journal</h1>
        <p className="text-sm text-muted">Freeform notes and reflections — whatever&apos;s on your mind.</p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="What's on your mind?"
          className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <MoodPicker value={mood} onChange={setMood} />
        <button
          type="button"
          disabled={submitting || !content.trim()}
          onClick={handleAdd}
          className="self-start rounded-md border-2 border-foreground bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
        >
          Save entry
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-md border-2 border-foreground bg-surface p-4">
            {editingId === entry.id ? (
              <EditEntryForm entry={entry} onSave={(patch) => handleSaveEdit(entry.id, patch)} onCancel={() => setEditingId(null)} />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setEditingId(entry.id)} className="min-w-0 flex-1 text-left">
                  <p className="whitespace-pre-wrap text-sm hover:underline">{entry.content}</p>
                  <p className="mt-2 font-mono text-xs tracking-wide text-muted uppercase">
                    {new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    {entry.mood && ` · ${MOOD_EMOJI[entry.mood]}`}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => user && db && deleteJournalEntry(db, user.uid, entry.id)}
                  className="shrink-0 rounded-md px-3 py-1.5 font-mono text-xs font-bold text-red-600 uppercase hover:bg-red-600/10"
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
            No entries yet — write your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
