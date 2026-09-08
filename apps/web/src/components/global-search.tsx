"use client";

import {
  type Goal,
  type Reminder,
  type Task,
} from "@life-client/shared";
import { data } from "@life-client/shared";
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
    const unsubs = [
      data.subscribeTasks(user.uid, setTasks),
      data.subscribeGoals(user.uid, setGoals),
      data.subscribeReminders(user.uid, setReminders),
    ];
    return () => unsubs.forEach((u) => u());
  }, [open, user]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results: SearchResult[] = q
    ? [
        ...tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .map((t): SearchResult => ({ id: t.id, kind: "Task", title: t.title, href: "/tasks" })),
        ...goals
          .filter((g) => g.title.toLowerCase().includes(q))
          .map((g): SearchResult => ({ id: g.id, kind: "Goal", title: g.title, href: "/goals" })),
        ...reminders
          .filter((r) => r.title.toLowerCase().includes(q))
          .map((r): SearchResult => ({ id: r.id, kind: "Reminder", title: r.title, href: "/dashboard" })),
      ].slice(0, 30)
    : [];

  function goTo(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={close}>
      <div
        className="w-full max-w-lg rounded-md border-2 border-foreground bg-surface shadow-[4px_4px_0_0_var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Tasks, Goals, Reminders…"
          className="w-full rounded-t-md border-b-2 border-foreground bg-background px-4 py-3 text-sm outline-none placeholder:text-muted"
        />
        <ul className="max-h-80 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <button
                type="button"
                onClick={() => goTo(r.href)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent/20"
              >
                <span className="shrink-0 rounded-full border-2 border-foreground bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
                  {r.kind}
                </span>
                <span className="min-w-0 truncate">{r.title}</span>
              </button>
            </li>
          ))}
          {q && results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>}
          {!q && <li className="px-4 py-6 text-center text-sm text-muted">Start typing to search.</li>}
        </ul>
      </div>
    </div>
  );
}
