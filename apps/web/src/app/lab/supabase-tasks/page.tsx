"use client";

import {
  advanceTaskStatusSb,
  createTaskSb,
  deleteTaskSb,
  subscribeTasksSb,
  type Task,
  type TaskStatus,
} from "@life-client/shared";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const NEXT: Record<TaskStatus, TaskStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };

const CONFIGURED = supabase != null;

export default function SupabaseTasksLab() {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState(CONFIGURED ? "starting…" : "not configured");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(
    CONFIGURED ? null : "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set for this environment.",
  );
  const [title, setTitle] = useState("");
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      setStatus("authenticating…");
      const { data: sessionData } = await supabase.auth.getSession();
      let uid = sessionData.session?.user.id ?? null;
      if (!uid) {
        const { data, error: signInErr } = await supabase.auth.signInAnonymously();
        if (signInErr) {
          setError(
            `Anonymous sign-in failed: ${signInErr.message}. Enable it in Supabase → Authentication → Providers → Anonymous.`,
          );
          setStatus("auth error");
          return;
        }
        uid = data.user?.id ?? null;
      }
      if (cancelled || !uid) return;
      setUserId(uid);
      setStatus("subscribing…");

      unsubRef.current = subscribeTasksSb(
        supabase,
        uid,
        (rows) => {
          setTasks(rows);
          setStatus(`live · ${rows.length} row${rows.length === 1 ? "" : "s"}`);
        },
        (e) => {
          setError(e.message);
          setStatus("subscribe error");
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubRef.current?.();
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !userId || !title.trim()) return;
    setError(null);
    try {
      await createTaskSb(supabase, userId, {
        title: title.trim(),
        status: "todo",
        priority: "medium",
        difficulty: "medium",
        category: "work",
        source: "manual",
        tags: [],
      });
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Lab</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Supabase Tasks</h1>
        <p className="text-sm text-muted">
          Phase 0 spike — exercises <code>subscribeTasksSb</code> + CRUD against the live Supabase
          project via an anonymous session. Open this page in two tabs and edit in one to see
          realtime propagate.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          status: <span className="text-foreground">{status}</span>
          {userId && <> · uid {userId.slice(0, 8)}…</>}
        </p>
      </div>

      {error && (
        <p className="rounded-md border-2 border-danger bg-danger/5 p-3 text-xs text-danger">{error}</p>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task…"
          className="flex-1 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!userId || !title.trim()}
          className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-2"
          >
            <span className={`text-sm ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</span>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => supabase && userId && advanceTaskStatusSb(supabase, userId, t, NEXT[t.status])}
                className="rounded border-2 border-foreground px-2 py-1 font-mono text-[10px] font-bold uppercase hover:bg-accent/20"
              >
                {t.status}
              </button>
              <button
                type="button"
                onClick={() => supabase && userId && deleteTaskSb(supabase, userId, t.id)}
                className="rounded px-2 py-1 font-mono text-[10px] font-bold text-danger uppercase hover:bg-danger/10"
              >
                del
              </button>
            </span>
          </li>
        ))}
        {tasks.length === 0 && <li className="text-xs text-muted">no rows yet</li>}
      </ul>
    </main>
  );
}
