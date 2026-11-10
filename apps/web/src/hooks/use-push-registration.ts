"use client";

import { data, webPushTokenDocId } from "@life-client/shared";
import { useEffect } from "react";
import { db } from "@/lib/firebase";

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Requests notification permission and registers a web push subscription once a user is signed in. No-ops when service workers/push aren't supported (e.g. Safari <16, or no permission granted). */
export function usePushRegistration(uid: string | undefined) {
  useEffect(() => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
    if (!uid || !db || !vapidPublicKey) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const currentUid = uid;

    let cancelled = false;

    async function register() {
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
      }
      if (Notification.permission !== "granted" || cancelled) return;

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        }));

      const json = subscription.toJSON();
      if (!cancelled && db && json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await data.registerWebPushSubscription(currentUid, {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
      }
    }

    register().catch((err) => console.error("Could not register web push subscription", err));

    return () => {
      cancelled = true;
    };
  }, [uid]);
}

/**
 * Removes this browser's push subscription for the user signing out.
 *
 * Nothing used to clean up on sign-out, and `getSubscription()` returns the
 * *browser's* existing subscription rather than creating a per-user one — so
 * when a second person signed in on the same browser, the same endpoint was
 * registered under their uid too. Both users then had it, and the first user's
 * task and digest notifications kept arriving in the second user's session.
 * That is a cross-account data leak, not just stale state.
 *
 * Both halves matter: deleting the token doc stops the server sending to it,
 * and `unsubscribe()` releases the browser subscription so the next sign-in
 * mints a fresh endpoint instead of inheriting this one.
 */
export async function unregisterThisBrowser(uid: string): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.toJSON().endpoint;
  if (endpoint) await data.unregisterPushToken(uid, webPushTokenDocId(endpoint));
  await subscription.unsubscribe();
}
