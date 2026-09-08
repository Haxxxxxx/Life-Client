"use client";

import { data } from "@life-client/shared";
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
