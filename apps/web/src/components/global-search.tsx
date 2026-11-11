"use client";

import {
  type Goal,
  type Reminder,
  type Task,
} from "@life-client/shared";
import { data, visibleGoals, visibleTasks } from "@life-client/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

interface SearchResult {
  id: string;
  kind: "Task" | "Goal" | "Reminder";
  title: string;
  href: string;
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    onOpenChange(false);
    setQuery("");
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          onOpenChange(false);
          setQuery("");
        } else {
          onOpenChange(true);
        }
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
        setQuery("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    const onError = (error: Error) => setLoadError(error.message);
    const unsubs = [
      // A failed read here used to mean the palette simply found nothing,
      // which is indistinguishable from "no matches" and far more misleading.
      data.subscribeTasks(user.uid, setTasks, onError),
      data.subscribeGoals(user.uid, setGoals, onError),
      data.subscribeReminders(user.uid, setReminders, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [open, user]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  // Firestore documents are unvalidated, so a row with a missing title used to
  // throw on `.toLowerCase()` and take the whole search overlay down with it.
  const matches = (title: string | undefined, needle: string) =>
    typeof title === "string" && title.toLowerCase().includes(needle);
  const results: SearchResult[] = q
    ? [
        // Tasks link to the item, not the list. `/tasks/[id]` exists, and
        // sending someone who searched for one specific task to a list of all
        // of them makes the search little better than a filter.
        ...visibleTasks(tasks)
          .filter((t) => matches(t.title, q))
          .map((t): SearchResult => ({ id: t.id, kind: "Task", title: t.title, href: `/tasks/${t.id}` })),
        // Goals and reminders have no detail route, so these stay on the list
        // page they live on.
        ...visibleGoals(goals)
          .filter((g) => matches(g.title, q))
          .map((g): SearchResult => ({ id: g.id, kind: "Goal", title: g.title, href: "/goals" })),
        ...reminders
          .filter((r) => matches(r.title, q))
          .map((r): SearchResult => ({ id: r.id, kind: "Reminder", title: r.title, href: "/dashboard" })),
      ].slice(0, 30)
    : [];

  function goTo(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24 backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Tasks, Goals, Reminders…"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-muted"
        />
        <ul className="max-h-80 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                type="button"
                onClick={() => goTo(r.href)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="shrink-0 rounded-full border border-border-strong bg-primary/10 px-2 py-0.5 font-mono text-micro font-bold text-primary uppercase">
                  {r.kind}
                </span>
                <span className="min-w-0 truncate text-foreground">{r.title}</span>
              </button>
            </li>
          ))}
          {loadError && (
            <li className="px-4 py-6 text-center text-sm text-danger" role="alert">
              Could not load your data — {loadError}
            </li>
          )}
          {!loadError && q && results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>
          )}
          {!q && <li className="px-4 py-6 text-center text-sm text-muted">Start typing to search.</li>}
        </ul>
      </div>
    </div>
  );
}
