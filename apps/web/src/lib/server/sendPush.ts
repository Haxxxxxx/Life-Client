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

  await Promise.allSettled([
    ...(expoTokens.length > 0
      ? [
          fetch("https://exp.host/--/api/v2/push/send", {
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
          }),
        ]
      : []),
    ...webTokens.map(async (t) => {
      ensureVapidConfigured();
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
}
