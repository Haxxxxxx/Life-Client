// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import {
  dateKeyInZone,
  normalizeTimeZone,
  reminderUrgencyInZone,
  visibleTasks,
  type PushToken,
  type Reminder,
  type Task,
} from "@life-client/shared";
import { FieldPath, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { forEachUser, type FanOutResult } from "./fanOut";
import { sendPushToUser } from "./sendPush";

const PAGE_SIZE = 1000;

interface DigestTarget {
  uid: string;
  /** The zone of the device this user most recently opened the app on. */
  timeZone: string;
}

/**
 * Every user with at least one registered device, paired with the zone to
 * judge "today" in.
 *
 * Paged rather than one unbounded `.get()`: this is a collection-group scan
 * across every device of every user, and the whole result set was being
 * materialised in a single Lambda's memory. It also only ever grows, because
 * a token is only pruned when a push to it comes back DeviceNotRegistered.
 *
 * The zone comes from the token docs themselves rather than a profile field,
 * which means it needs no separate read and no new collection: a device
 * re-registers on every app start, so `seenAt` tracks real use and the zone
 * follows the user when they travel.
 */
async function digestTargets(): Promise<DigestTarget[]> {
  const best = new Map<string, { timeZone: string | undefined; seenAt: string }>();
  let last: QueryDocumentSnapshot | undefined;

  for (;;) {
    let page = adminDb.collectionGroup("pushTokens").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) page = page.startAfter(last);
    const snapshot = await page.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) continue;
      const token = doc.data() as PushToken;
      // ISO-8601 UTC strings compare lexicographically in chronological order,
      // so no parsing is needed to find the most recent. Tokens written before
      // seenAt existed fall back to createdAt, and then to "" so that any
      // device reporting a time wins over one reporting none.
      const seenAt = token.seenAt ?? token.createdAt ?? "";
      const current = best.get(uid);
      if (!current || seenAt > current.seenAt) {
        best.set(uid, { timeZone: token.timeZone, seenAt });
      }
    }

    if (snapshot.size < PAGE_SIZE) break;
    last = snapshot.docs[snapshot.size - 1];
  }

  return [...best].map(([uid, { timeZone }]) => ({ uid, timeZone: normalizeTimeZone(timeZone) }));
}

async function sendDigestForUser(uid: string, timeZone: string, now: Date): Promise<void> {
  // The user's today, not the runtime's. This cron runs on Vercel, whose
  // process clock is UTC, so the previous local-getter version asked "what is
  // due today in UTC" — a different day from the user's own for part of every
  // day everywhere outside Greenwich. A task due today in Tokyo was reported
  // the morning before; one due today in Los Angeles was missed until the next
  // run, by which point it was overdue.
  const today = dateKeyInZone(now, timeZone);
  const userRef = adminDb.collection("users").doc(uid);

  const [tasksSnap, remindersSnap] = await Promise.all([
    userRef.collection("tasks").where("status", "!=", "done").get(),
    userRef.collection("reminders").get(),
  ]);

  // visibleTasks drops what the archive cron swept up. Without it the digest
  // counted tasks the user can no longer see in any list view, so the number
  // in the push did not match the number on screen.
  const dueTasks = visibleTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Task)).filter(
    (t) => typeof t.dueDate === "string" && t.dueDate <= today,
  );

  const dueReminders = remindersSnap.docs
    .map((d) => d.data() as Reminder)
    .filter((r) => {
      if (typeof r.deadline !== "string") return false;
      const urgency = reminderUrgencyInZone(r.deadline, timeZone, now);
      return urgency === "overdue" || urgency === "due-today";
    });

  if (dueTasks.length === 0 && dueReminders.length === 0) return;

  const parts: string[] = [];
  if (dueTasks.length > 0) parts.push(`${dueTasks.length} task${dueTasks.length === 1 ? "" : "s"} due`);
  if (dueReminders.length > 0) parts.push(`${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} due`);

  await sendPushToUser(uid, {
    title: "Today's rundown",
    body: parts.join(" · "),
    data: { url: "/dashboard" },
  });
}

/**
 * Sends one daily digest push per user with anything due today or overdue —
 * the cron only runs once a day, so this is a summary, not real-time
 * due-soon alerts.
 *
 * Returns a tally so the cron can report it. This used to be a bare
 * `Promise.allSettled` over every uid at once: unbounded fan-out against
 * Firestore and the Expo push service, with every rejection discarded
 * unexamined, so a digest that failed for every user looked identical to one
 * that worked.
 */
export async function sendDailyDigests(): Promise<FanOutResult> {
  const targets = await digestTargets();
  // One instant for the whole run, so two users are never judged against
  // clocks minutes apart — which near midnight is a different day.
  const now = new Date();
  const zoneFor = new Map(targets.map((t) => [t.uid, t.timeZone]));

  return forEachUser("digest", [...zoneFor.keys()], (uid) =>
    sendDigestForUser(uid, zoneFor.get(uid) ?? "UTC", now),
  );
}
