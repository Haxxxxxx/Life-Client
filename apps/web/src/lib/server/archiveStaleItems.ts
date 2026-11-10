// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { FieldPath, type DocumentReference, type Query, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./admin";

// Non-destructive cleanup: items sitting "done" for this long quietly drop out
// of the main lists (Goal -> "archived" status, Task -> archived: true), but
// nothing is ever deleted — both remain fully queryable in Firestore, and the
// Archived section on Goals and Tasks can restore them.
const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Page size for the collection-group scans.
 *
 * These used to be a single unbounded `.get()` over every completed goal and
 * every done task across every user, materialised into memory at once. Worse
 * for tasks specifically: archiving writes `archived: true` but leaves
 * `status: "done"`, so an archived task never leaves the query and the read
 * grows forever. Goals don't have that problem — they flip to
 * `status: "archived"` and drop out — so the two halves of this function
 * scaled in opposite directions, which is probably why it went unnoticed.
 *
 * Paging bounds the memory, which is what actually took the process down: an
 * OOM here kills the whole cron invocation, so Strava, dev activity, calendar,
 * Spotify and the daily digest never run either.
 *
 * The read *cost* still scales with completed-task count. Narrowing the query
 * to `.where("archived", "==", false)` would fix that too, but Firestore
 * equality does not match documents where the field is absent, so it needs a
 * one-off backfill over existing done tasks first. Worth doing if this ever
 * gets expensive; not worth the migration today.
 */
const PAGE_SIZE = 1000;

/**
 * Goal.updatedAt is written as a plain ISO string (see goals.ts), and
 * Task.createdAt/updatedAt are now ISO strings too — but documents written
 * before that change hold a Firestore Timestamp, despite both being typed
 * `string` on the shared interfaces. Handle either shape rather than assuming
 * the TS type matches the runtime value.
 */
function toMillis(value: string | Timestamp | undefined): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
  return null;
}

/**
 * When the item was actually finished.
 *
 * The window used to key off `updatedAt` alone, which this codebase documents
 * as the wrong field for exactly this: `types.ts` explains that `completedAt`
 * exists "unlike updatedAt, which bumps on any field edit, so a later
 * rename/link doesn't reattribute a task's completion date to whenever it was
 * last touched." syncDevActivity bumps `updatedAt` on every open-PR task on
 * every run, so "done 30+ days" really meant "untouched 30+ days".
 *
 * Mirrors taskCompletedIso's precedence, including its fallback for tasks
 * created before completedAt existed.
 */
function finishedAtMillis(data: Record<string, unknown>): number | null {
  return (
    toMillis(data.completedAt as string | Timestamp | undefined) ??
    toMillis(data.updatedAt as string | Timestamp | undefined)
  );
}

interface StaleRefs {
  goalRefs: DocumentReference[];
  taskRefs: DocumentReference[];
}

/**
 * Walks a collection-group query in pages, handing each document to `visit`.
 *
 * Ordered by document id so the cursor is total and stable; `startAfter` takes
 * the last snapshot rather than a raw id because a collection-group cursor is
 * the full resource path, not the leaf id.
 */
async function forEachDocument(
  base: Query,
  visit: (uid: string, data: Record<string, unknown>, ref: DocumentReference) => void,
): Promise<void> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let page = base.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      // A collection group matches any collection with that name at any depth.
      // Today `tasks`/`goals` only ever live under users/{uid}, but checking the
      // grandparent makes that assumption explicit rather than silently
      // mis-grouping if a nested subcollection is ever added.
      const parent = doc.ref.parent.parent;
      if (!parent || parent.parent.id !== "users") continue;
      visit(parent.id, doc.data(), doc.ref);
    }

    if (snapshot.size < PAGE_SIZE) return;
    cursor = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (!cursor) return;
  }
}

export async function archiveStaleItemsForAllUsers(): Promise<{ users: number; goals: number; tasks: number }> {
  const cutoffMs = Date.now() - ARCHIVE_AFTER_MS;

  const byUid = new Map<string, StaleRefs>();
  function refsFor(uid: string): StaleRefs {
    let entry = byUid.get(uid);
    if (!entry) {
      entry = { goalRefs: [], taskRefs: [] };
      byUid.set(uid, entry);
    }
    return entry;
  }

  // allSettled, not all: these are independent, and a transient failure reading
  // goals should not mean nothing is archived for anyone — including all the
  // tasks that read fine.
  const scans = await Promise.allSettled([
    forEachDocument(adminDb.collectionGroup("goals").where("status", "==", "completed"), (uid, data, ref) => {
      const finishedMs = finishedAtMillis(data);
      if (finishedMs !== null && finishedMs < cutoffMs) refsFor(uid).goalRefs.push(ref);
    }),
    forEachDocument(adminDb.collectionGroup("tasks").where("status", "==", "done"), (uid, data, ref) => {
      if (data.archived) return;
      const finishedMs = finishedAtMillis(data);
      if (finishedMs !== null && finishedMs < cutoffMs) refsFor(uid).taskRefs.push(ref);
    }),
  ]);
  for (const scan of scans) {
    if (scan.status === "rejected") console.error("archiveStaleItems: a scan failed", scan.reason);
  }

  let goals = 0;
  let tasks = 0;

  // BulkWriter rather than WriteBatch: a batch is all-or-nothing and capped at
  // 500 ops, so one task deleted between the read and the commit threw
  // NOT_FOUND and silently failed up to 499 unrelated writes alongside it.
  // BulkWriter isolates per-document failures and handles its own batching.
  const writer = adminDb.bulkWriter();
  writer.onWriteError((error) => {
    // NOT_FOUND means the user deleted it while we were scanning — expected,
    // and nothing to retry. Anything else gets BulkWriter's default retries.
    if (error.code === 5) return false;
    return error.failedAttempts < 3;
  });

  const pending: Promise<unknown>[] = [];
  for (const { goalRefs, taskRefs } of byUid.values()) {
    for (const ref of goalRefs) {
      pending.push(
        writer
          .update(ref, { status: "archived", updatedAt: new Date().toISOString() })
          .then(() => {
            goals++;
          })
          .catch(() => {}),
      );
    }
    for (const ref of taskRefs) {
      pending.push(
        writer
          .update(ref, { archived: true })
          .then(() => {
            tasks++;
          })
          .catch(() => {}),
      );
    }
  }

  await writer.close();
  await Promise.allSettled(pending);

  return { users: byUid.size, goals, tasks };
}
