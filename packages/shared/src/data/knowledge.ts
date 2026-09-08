import * as fb from "../knowledge";
import * as sb from "../supabase/knowledge";
import type {
  CodeDrill,
  DailyLesson,
  NewReadingListItem,
  ReadingListItem,
  VocabMastery,
  VocabWord,
} from "../types";
import { getDataBackend } from "./backend";

export { todayLessonId, dailyLessonStreak } from "../knowledge";

export function getTodayLesson(uid: string): Promise<DailyLesson | null> {
  const b = getDataBackend();
  return b.provider === "firebase" ? fb.getTodayLesson(b.firestore, uid) : sb.getTodayLessonSb(b.client, uid);
}

export function subscribeDailyLessons(
  uid: string,
  onChange: (lessons: DailyLesson[]) => void,
  onError?: (error: Error) => void,
  max = 30,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeDailyLessons(b.firestore, uid, onChange, onError, max)
    : sb.subscribeDailyLessonsSb(b.client, uid, onChange, onError, max);
}

export function subscribeCodeDrills(
  uid: string,
  onChange: (drills: CodeDrill[]) => void,
  onError?: (error: Error) => void,
  max = 50,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeCodeDrills(b.firestore, uid, onChange, onError, max)
    : sb.subscribeCodeDrillsSb(b.client, uid, onChange, onError, max);
}

export function subscribeVocabWords(
  uid: string,
  onChange: (words: VocabWord[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeVocabWords(b.firestore, uid, onChange, onError)
    : sb.subscribeVocabWordsSb(b.client, uid, onChange, onError);
}

export function setVocabMastery(uid: string, wordId: string, mastery: VocabMastery): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.setVocabMastery(b.firestore, uid, wordId, mastery)
    : sb.setVocabMasterySb(b.client, uid, wordId, mastery);
}

export function subscribeReadingList(
  uid: string,
  onChange: (items: ReadingListItem[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeReadingList(b.firestore, uid, onChange, onError)
    : sb.subscribeReadingListSb(b.client, uid, onChange, onError);
}

export function createReadingListItem(uid: string, item: NewReadingListItem): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createReadingListItem(b.firestore, uid, item)
    : sb.createReadingListItemSb(b.client, uid, item);
}

export function markReadingListItemRead(uid: string, itemId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.markReadingListItemRead(b.firestore, uid, itemId)
    : sb.markReadingListItemReadSb(b.client, uid, itemId);
}

export function deleteReadingListItem(uid: string, itemId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteReadingListItem(b.firestore, uid, itemId)
    : sb.deleteReadingListItemSb(b.client, uid, itemId);
}
