"use client";

import {
  buildConnectUrl,
  buildDisconnectUrl,
  type IntegrationConnection,
  type IntegrationProvider,
  subscribeIntegrations,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { webApiClient } from "@/lib/webApiClient";

const PROVIDER_META: Record<
  IntegrationProvider,
  { label: string; description: string; badge: string }
> = {
  github: {
    label: "GitHub",
    description: "Mirror every open PR across the repos you own or belong to into Tasks — reconnect to grant org access.",
    badge: "GH",
  },
  gitlab: {
    label: "GitLab",
    description: "Same as GitHub, for your GitLab-hosted projects.",
    badge: "GL",
  },
  google_calendar: {
    label: "Google Calendar",
    description: "Surface today's and this week's events on your Dashboard.",
    badge: "CAL",
  },
  strava: {
    label: "Strava",
    description: "Sync your runs/rides into the Sports tab automatically.",
    badge: "STR",
  },
  spotify: {
    label: "Spotify",
    description: "Currently playing, recent tracks, and top artists in Music.",
    badge: "SPT",
  },
};

const PROVIDER_ORDER: IntegrationProvider[] = ["github", "gitlab", "google_calendar", "strava", "spotify"];

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Record<
    IntegrationProvider,
    IntegrationConnection
  > | null>(null);
  const [syncing, setSyncing] = useState<IntegrationProvider | null>(null);
  const [syncResult, setSyncResult] = useState<{
    provider: IntegrationProvider;
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeIntegrations(db, user.uid, setConnections);
  }, [user]);

  async function handleSync(provider: IntegrationProvider) {
    setSyncing(provider);
    setSyncResult(null);
    try {
      const token = await webApiClient.getIdToken();
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ provider }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
      setSyncResult({ provider, ok: true, text: "Synced — check your Tasks" });
    } catch (err) {
      setSyncResult({ provider, ok: false, text: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(null);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Connect</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted">
          Link the tools you already use so Life Client stays up to date on its own.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_ORDER.map((provider) => {
          const meta = PROVIDER_META[provider];
          const connection = connections?.[provider];
          const connected = connection?.status === "connected";
          const errored = connection?.status === "error";
          return (
            <div
              key={provider}
              className="flex flex-col justify-between gap-4 rounded-md border-2 border-foreground bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border-2 border-foreground bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold">
                      {meta.badge}
                    </span>
                    <p className="font-bold">{meta.label}</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{meta.description}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[10px] font-bold tracking-wide uppercase ${
                    connected ? "text-primary" : errored ? "text-red-600" : "text-muted"
                  }`}
                >
                  {connected
                    ? `Connected${connection?.externalAccountLabel ? ` · ${connection.externalAccountLabel}` : ""}`
                    : errored
                      ? "Connection failed"
                      : "Not connected"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {connected && (
                    <button
                      type="button"
                      onClick={() => handleSync(provider)}
                      disabled={!user || syncing === provider}
                      className="rounded-md border-2 border-foreground bg-surface px-3 py-1.5 font-mono text-xs font-bold uppercase shadow-[2px_2px_0_0_var(--foreground)] transition hover:bg-accent/20 disabled:opacity-50"
                    >
                      {syncing === provider ? "Syncing…" : "Sync now"}
                    </button>
                  )}
                  <a
                    href={
                      !user
                        ? undefined
                        : connected
                          ? buildDisconnectUrl(origin, provider, user.uid, "/integrations")
                          : buildConnectUrl(origin, provider, user.uid, "/integrations")
                    }
                    aria-disabled={!user}
                    className={`rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase shadow-[2px_2px_0_0_var(--foreground)] transition ${
                      !user
                        ? "pointer-events-none opacity-40"
                        : connected
                          ? "bg-surface hover:bg-red-600/10"
                          : "bg-primary text-primary-foreground hover:-translate-y-0.5"
                    }`}
                  >
                    {connected ? "Disconnect" : errored ? "Retry" : "Connect"}
                  </a>
                </div>
              </div>
              {connected && connection?.lastSyncAt && syncResult?.provider !== provider && (
                <p className="text-[10px] text-muted">Last synced {relativeTime(connection.lastSyncAt)}</p>
              )}
              {syncResult?.provider === provider && (
                <p className={`text-[10px] ${syncResult.ok ? "text-primary" : "text-red-600"}`}>
                  {syncResult.text}
                </p>
              )}
              {errored && connection?.lastError && syncResult?.provider !== provider && (
                <p className="truncate text-[10px] text-red-600" title={connection.lastError}>
                  {connection.lastError}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
