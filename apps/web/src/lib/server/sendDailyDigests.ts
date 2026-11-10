// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { reminderUrgency, type Reminder, type Task } from "@life-client/shared";
import { adminDb } from "./admin";
import { sendPushToUser } from "./sendPush";

async function allUidsWithPushTokens(): Promise<string[]> {
  const snapshot = await adminDb.collectionGroup("pushTokens").get();
  const uids = new Set<string>();
  for (const doc of snapshot.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) uids.add(uid);
  }
  return [...uids];
}

function todayDateStr(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function sendDigestForUser(uid: string): Promise<void> {
  const today = todayDateStr();
  const userRef = adminDb.collection("users").doc(uid);

  const [tasksSnap, remindersSnap] = await Promise.all([
    userRef.collection("tasks").where("status", "!=", "done").get(),
    userRef.collection("reminders").get(),
  ]);

  const dueTasks = tasksSnap.docs
    .map((d) => d.data() as Task)
    .filter((t) => t.dueDate && t.dueDate <= today);

  const dueReminders = remindersSnap.docs
    .map((d) => d.data() as Reminder)
    .filter((r) => {
      const urgency = reminderUrgency(r.deadline);
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

/** Sends one daily digest push per user with anything due today or overdue — the cron only runs once a day, so this is a summary, not real-time due-soon alerts. */
export async function sendDailyDigests(): Promise<void> {
  const uids = await allUidsWithPushTokens();
  await Promise.allSettled(uids.map((uid) => sendDigestForUser(uid)));
}
