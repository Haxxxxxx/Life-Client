"use client";

import { type SportActivity, subscribeSportActivities } from "@life-client/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

function formatDistance(meters?: number): string {
  if (!meters) return "—";
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SportsPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeSportActivities(db, user.uid, (a) => {
      setActivities(a);
      setLoaded(true);
    });
  }, [user]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Performance</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Sports</h1>
        <p className="text-sm text-muted">Synced from Strava once connected.</p>
      </div>

      {loaded && activities.length === 0 && (
        <div className="rounded-md border-2 border-dashed border-foreground/30 bg-surface px-4 py-8 text-center text-sm text-muted">
          No activities yet.{" "}
          <Link href="/integrations" className="font-bold text-primary hover:underline">
            Connect Strava
          </Link>{" "}
          to pull in your runs and rides.
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{activity.name}</p>
              <p className="font-mono text-xs tracking-wide text-muted uppercase">
                {activity.type} · {new Date(activity.startDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 gap-4 text-right font-mono text-xs">
              <div>
                <p className="font-bold text-primary">{formatDistance(activity.distanceMeters)}</p>
                <p className="text-muted">distance</p>
              </div>
              <div>
                <p className="font-bold text-primary">{formatDuration(activity.movingTimeSec)}</p>
                <p className="text-muted">time</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
