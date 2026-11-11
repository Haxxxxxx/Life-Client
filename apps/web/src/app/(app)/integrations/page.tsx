"use client";

import {
  disconnectIntegration,
  startOAuthConnect,
  type IntegrationConnection,
  type IntegrationProvider,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useState } from "react";
import { Button, Card, PageHeader, pageShellClassName } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
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
  const [pending, setPending] = useState<IntegrationProvider | null>(null);
  const [syncResult, setSyncResult] = useState<{
    provider: IntegrationProvider;
    ok: boolean;
    text: string;
  } | null>(null);

  // Keyed on uid rather than a boolean reset inside the effect: setState in an
  // effect body cascades a render, and deriving it stops a user switch from
  // briefly showing the previous account's rows as loaded.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = Boolean(user) && loadedFor === user?.uid;

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return data.subscribeIntegrations(uid, (next) => {
      setConnections(next);
      setLoadedFor(uid);
    });
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

  // Connect/disconnect are authenticated POSTs now (the uid comes from the ID
  // token server-side), so they can't be plain links any more — the bearer
  // token can't ride on a top-level navigation. Connect fetches the provider
  // URL first, then navigates; disconnect needs no navigation at all, since the
  // integrations subscription pushes the new status.
  async function handleConnection(provider: IntegrationProvider, connected: boolean) {
    setPending(provider);
    setSyncResult(null);
    try {
      if (connected) {
        await disconnectIntegration(webApiClient, provider);
      } else {
        window.location.href = await startOAuthConnect(webApiClient, provider, "/integrations");
        return; // navigating away — leave `pending` set so the button stays busy
      }
    } catch (err) {
      setSyncResult({
        provider,
        ok: false,
        text: err instanceof Error ? err.message : "Request failed",
      });
    }
    setPending(null);
  }

  return (
    <div className={pageShellClassName()}>
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        description="Link the tools you already use so Life Client stays up to date on its own."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_ORDER.map((provider) => {
          const meta = PROVIDER_META[provider];
          const connection = connections?.[provider];
          const connected = connection?.status === "connected";
          const errored = connection?.status === "error";
          return (
            <Card key={provider} className="flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-border-strong bg-primary/15 px-1.5 py-0.5 font-mono text-micro font-bold">
                      {meta.badge}
                    </span>
                    <p className="font-bold">{meta.label}</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{meta.description}</p>
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-micro font-bold tracking-wide uppercase ${
                    connected ? "text-primary" : errored ? "text-danger" : "text-muted"
                  }`}
                >
                  {/* "Checking…" while the first snapshot is in flight. The
                      cards always render, so without this every provider
                      claimed "Not connected" before we actually knew. */}
                  {!loaded
                    ? "Checking…"
                    : connected
                      ? `Connected${connection?.externalAccountLabel ? ` · ${connection.externalAccountLabel}` : ""}`
                      : errored
                        ? "Connection failed"
                        : "Not connected"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {connected && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSync(provider)}
                      disabled={!user || syncing === provider}
                    >
                      {syncing === provider ? "Syncing…" : "Sync now"}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleConnection(provider, connected)}
                    disabled={!user || pending === provider}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      !user || pending === provider
                        ? "cursor-not-allowed border border-border opacity-40"
                        : connected
                          ? "border border-border text-foreground hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                          : "bg-primary text-primary-foreground shadow-md shadow-black/20 hover:-translate-y-0.5"
                    }`}
                  >
                    {pending === provider ? "…" : connected ? "Disconnect" : errored ? "Retry" : "Connect"}
                  </button>
                </div>
              </div>
              {connected && connection?.lastSyncAt && syncResult?.provider !== provider && (
                <p className="text-micro text-muted">Last synced {relativeTime(connection.lastSyncAt)}</p>
              )}
              {syncResult?.provider === provider && (
                <p className={`text-micro ${syncResult.ok ? "text-primary" : "text-danger"}`}>
                  {syncResult.text}
                </p>
              )}
              {errored && connection?.lastError && syncResult?.provider !== provider && (
                <p className="truncate text-micro text-danger" title={connection.lastError}>
                  {connection.lastError}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
