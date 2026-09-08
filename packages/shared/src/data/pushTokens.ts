import * as fb from "../pushTokens";
import * as sb from "../supabase/pushTokens";
import type { PushToken } from "../types";
import { getDataBackend } from "./backend";

export function registerExpoPushToken(uid: string, expoPushToken: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.registerExpoPushToken(b.firestore, uid, expoPushToken)
    : sb.registerExpoPushTokenSb(b.client, uid, expoPushToken);
}

export function registerWebPushSubscription(
  uid: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.registerWebPushSubscription(b.firestore, uid, subscription)
    : sb.registerWebPushSubscriptionSb(b.client, uid, subscription);
}

export function unregisterPushToken(uid: string, tokenId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.unregisterPushToken(b.firestore, uid, tokenId)
    : sb.unregisterPushTokenSb(b.client, uid, tokenId);
}

export function listPushTokens(uid: string): Promise<PushToken[]> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.listPushTokens(b.firestore, uid)
    : sb.listPushTokensSb(b.client, uid);
}
