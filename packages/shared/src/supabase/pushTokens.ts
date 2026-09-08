import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushToken } from "../types";

/** Same FNV-1a hash as the Firestore module — a re-registered device overwrites
 * its own row instead of piling up duplicates. */
function tokenRowId(raw: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export async function registerExpoPushTokenSb(
  client: SupabaseClient,
  userId: string,
  expoPushToken: string,
): Promise<void> {
  const { error } = await client.from("push_tokens").upsert({
    id: tokenRowId(expoPushToken),
    user_id: userId,
    platform: "expo",
    expo_push_token: expoPushToken,
  });
  if (error) throw new Error(error.message);
}

export async function registerWebPushSubscriptionSb(
  client: SupabaseClient,
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const { error } = await client.from("push_tokens").upsert({
    id: tokenRowId(subscription.endpoint),
    user_id: userId,
    platform: "web",
    web_subscription: subscription,
  });
  if (error) throw new Error(error.message);
}

export async function unregisterPushTokenSb(
  client: SupabaseClient,
  userId: string,
  tokenId: string,
): Promise<void> {
  const { error } = await client.from("push_tokens").delete().eq("id", tokenId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function listPushTokensSb(client: SupabaseClient, userId: string): Promise<PushToken[]> {
  const { data, error } = await client
    .from("push_tokens")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    platform: r.platform as PushToken["platform"],
    expoPushToken: (r.expo_push_token as string | null) ?? undefined,
    webSubscription: (r.web_subscription as PushToken["webSubscription"]) ?? undefined,
    createdAt: r.created_at as string,
  }));
}
