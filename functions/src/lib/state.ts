import * as crypto from "node:crypto";
import { db } from "./admin";

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  uid: string;
  provider: string;
  returnTo: string;
  createdAt: number;
}

export async function createOAuthState(
  uid: string,
  provider: string,
  returnTo: string,
): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  await db
    .collection("oauthState")
    .doc(token)
    .set({ uid, provider, returnTo, createdAt: Date.now() } satisfies OAuthState);
  return token;
}

export async function consumeOAuthState(token: string): Promise<OAuthState | null> {
  const ref = db.collection("oauthState").doc(token);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  const data = snap.data() as OAuthState;
  if (Date.now() - data.createdAt > STATE_TTL_MS) return null;
  return data;
}
