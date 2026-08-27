import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import type { JournalEntry, NewJournalEntry } from "./types";

function journalCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "journalEntries");
}

export function subscribeJournalEntries(
  db: Firestore,
  uid: string,
  onChange: (entries: JournalEntry[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(journalCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as JournalEntry)),
    (error) => onError?.(error),
  );
}

export async function createJournalEntry(db: Firestore, uid: string, entry: NewJournalEntry): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(journalCollection(db, uid), { ...entry, createdAt: now, updatedAt: now });
  return ref.id;
}

export async function updateJournalEntry(
  db: Firestore,
  uid: string,
  entryId: string,
  patch: Partial<NewJournalEntry>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "journalEntries", entryId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteJournalEntry(db: Firestore, uid: string, entryId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "journalEntries", entryId));
}
