// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import type { PushToken } from "@life-client/shared";
import webpush from "web-push";
import { adminDb } from "./admin";

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY not set");
  webpush.setVapidDetails("mailto:support@lifeclient.app", publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Sends a push notification to every device (Expo + web) the user has registered. Best-effort per-token — one bad/expired token doesn't block the others. */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<void> {
  const snapshot = await adminDb.collection("users").doc(uid).collection("pushTokens").get();
  const tokens = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PushToken);
  if (tokens.length === 0) return;

  const expoTokens = tokens.filter((t) => t.platform === "expo" && t.expoPushToken);
  const webTokens = tokens.filter((t) => t.platform === "web" && t.webSubscription);

  // Configured once, outside the per-token map. Inside it, a missing VAPID key
  // threw per token into allSettled and was swallowed — push silently did
  // nothing with no indication why.
  if (webTokens.length > 0) ensureVapidConfigured();

  const results = await Promise.allSettled([
    ...(expoTokens.length > 0
      ? [
          (async () => {
            const res = await fetch("https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify(
                expoTokens.map((t) => ({
                  to: t.expoPushToken,
                  title: payload.title,
                  body: payload.body,
                  data: payload.data,
                })),
              ),
            });
            // The response was never read, so an Expo-side rejection looked
            // like a successful send. A DeviceNotRegistered ticket means the
            // app was uninstalled; that token is dead and should go.
            if (!res.ok) {
              throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
            }
            const body = (await res.json()) as { data?: { status?: string; details?: { error?: string } }[] };
            await Promise.all(
              (body.data ?? []).map(async (ticket, i) => {
                if (ticket.status !== "error") return;
                const token = expoTokens[i];
                if (ticket.details?.error === "DeviceNotRegistered" && token) {
                  await adminDb.collection("users").doc(uid).collection("pushTokens").doc(token.id).delete();
                } else {
                  console.error("Expo push ticket error", ticket.details?.error ?? ticket);
                }
              }),
            );
          })(),
        ]
      : []),
    ...webTokens.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.webSubscription!.endpoint, keys: t.webSubscription!.keys },
          JSON.stringify(payload),
        );
      } catch (err) {
        // A 410/404 means the subscription is gone (user revoked permission, browser data cleared) — clean it up.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminDb.collection("users").doc(uid).collection("pushTokens").doc(t.id).delete();
        } else {
          throw err;
        }
      }
    }),
  ]);

  // allSettled discarded every rejection, so a VAPID key rotation (401/403) or
  // an Expo outage failed silently on a path that has no other signal.
  for (const result of results) {
    if (result.status === "rejected") console.error(`sendPushToUser failed for ${uid}`, result.reason);
  }
}
