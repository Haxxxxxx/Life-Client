import { type Firestore, collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import type { PushToken } from "./types";

function pushTokensCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "pushTokens");
}

/** Deterministic, Firestore-doc-id-safe hash (FNV-1a) — lets re-registering the same device overwrite its own doc instead of piling up duplicates. */
function tokenDocId(raw: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export async function registerExpoPushToken(db: Firestore, uid: string, expoPushToken: string): Promise<void> {
  const id = tokenDocId(expoPushToken);
  await setDoc(
    doc(pushTokensCollection(db, uid), id),
    { platform: "expo", expoPushToken, createdAt: new Date().toISOString() } satisfies Omit<PushToken, "id">,
  );
}

export async function registerWebPushSubscription(
  db: Firestore,
  uid: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const id = tokenDocId(subscription.endpoint);
  await setDoc(
    doc(pushTokensCollection(db, uid), id),
    { platform: "web", webSubscription: subscription, createdAt: new Date().toISOString() } satisfies Omit<
      PushToken,
      "id"
    >,
  );
}

export async function unregisterPushToken(db: Firestore, uid: string, tokenId: string): Promise<void> {
  await deleteDoc(doc(pushTokensCollection(db, uid), tokenId));
}

/** Server-side (admin SDK) reads use their own adminDb instance, but share this same collection path convention. */
export async function listPushTokens(db: Firestore, uid: string): Promise<PushToken[]> {
  const snapshot = await getDocs(pushTokensCollection(db, uid));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PushToken);
}
