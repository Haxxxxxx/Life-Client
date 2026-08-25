import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import type {
  CodeDrill,
  DailyLesson,
  NewReadingListItem,
  ReadingListItem,
  VocabMastery,
  VocabWord,
} from "./types";

/** YYYY-MM-DD in the caller's local timezone — used as the daily-lesson doc id. */
export function todayLessonId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export async function getTodayLesson(db: Firestore, uid: string): Promise<DailyLesson | null> {
  const snap = await getDoc(doc(db, "users", uid, "dailyLessons", todayLessonId()));
  return snap.exists() ? (snap.data() as DailyLesson) : null;
}

export function subscribeDailyLessons(
  db: Firestore,
  uid: string,
  onChange: (lessons: DailyLesson[]) => void,
  onError?: (error: Error) => void,
  max = 30,
): () => void {
  const q = query(
    collection(db, "users", uid, "dailyLessons"),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLesson)),
    (error) => onError?.(error),
  );
}

export function subscribeCodeDrills(
  db: Firestore,
  uid: string,
  onChange: (drills: CodeDrill[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  const q = query(
    collection(db, "users", uid, "codeDrills"),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as CodeDrill)),
    (error) => onError?.(error),
  );
}

export function subscribeVocabWords(
  db: Firestore,
  uid: string,
  onChange: (words: VocabWord[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(collection(db, "users", uid, "vocabWords"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as VocabWord)),
    (error) => onError?.(error),
  );
}

export async function setVocabMastery(
  db: Firestore,
  uid: string,
  wordId: string,
  mastery: VocabMastery,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "vocabWords", wordId), {
    mastery,
    updatedAt: serverTimestamp(),
  });
}

function readingListCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "readingList");
}

export function subscribeReadingList(
  db: Firestore,
  uid: string,
  onChange: (items: ReadingListItem[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(readingListCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ReadingListItem)),
    (error) => onError?.(error),
  );
}

export async function createReadingListItem(
  db: Firestore,
  uid: string,
  item: NewReadingListItem,
): Promise<string> {
  const ref = await addDoc(readingListCollection(db, uid), {
    ...item,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function markReadingListItemRead(
  db: Firestore,
  uid: string,
  itemId: string,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "readingList", itemId), {
    status: "read",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteReadingListItem(
  db: Firestore,
  uid: string,
  itemId: string,
): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "readingList", itemId));
}
