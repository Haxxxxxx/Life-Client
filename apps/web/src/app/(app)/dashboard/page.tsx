"use client";

import {
  type CalendarEvent,
  type DevActivitySummary,
  type SportActivity,
  type Task,
  subscribeCalendarEvents,
  subscribeDevActivity,
  subscribeSportActivities,
  subscribeTasks,
} from "@life-client/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-5 shadow-[3px_3px_0_0_var(--foreground)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--foreground)]"
    >
      <p className="font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">{title}</p>
      {children}
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeSportActivities(db, user.uid, setActivities, undefined, 1),
      subscribeCalendarEvents(db, user.uid, setEvents, undefined, 3),
      subscribeDevActivity(db, user.uid, "github", setGithub),
      subscribeDevActivity(db, user.uid, "gitlab", setGitlab),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const latestActivity = activities[0];
  const openPrCount = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Overview</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Welcome back{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Tasks" href="/tasks">
          <p className="text-3xl font-bold">{openTasks.length}</p>
          <p className="text-sm text-muted">open task{openTasks.length === 1 ? "" : "s"}</p>
        </Card>

        <Card title="Sports" href="/sports">
          {latestActivity ? (
            <>
              <p className="truncate text-lg font-bold">{latestActivity.name}</p>
              <p className="text-sm text-muted">
                {latestActivity.type} · {new Date(latestActivity.startDate).toLocaleDateString()}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No activity yet — connect Strava.</p>
          )}
        </Card>

        <Card title="Dev Activity" href="/integrations">
          <p className="text-3xl font-bold">{openPrCount}</p>
          <p className="text-sm text-muted">open pull request{openPrCount === 1 ? "" : "s"}</p>
        </Card>

        <Card title="Agenda" href="/integrations">
          {events.length > 0 ? (
            <p className="text-sm text-muted">
              Next: <span className="font-bold text-foreground">{events[0]!.title}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">No events yet — connect Google Calendar.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
