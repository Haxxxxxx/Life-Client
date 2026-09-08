import * as fb from "../challenges";
import * as sb from "../supabase/challenges";
import type { Challenge, NewChallenge } from "../types";
import { getDataBackend } from "./backend";

export { computeChallengeProgress, computeChallengeMilestones } from "../challenges";

export function subscribeChallenges(
  uid: string,
  onChange: (challenges: Challenge[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeChallenges(b.firestore, uid, onChange, onError)
    : sb.subscribeChallengesSb(b.client, uid, onChange, onError);
}

export function createChallenge(uid: string, challenge: NewChallenge): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createChallenge(b.firestore, uid, challenge)
    : sb.createChallengeSb(b.client, uid, challenge);
}

export function updateChallenge(
  uid: string,
  challengeId: string,
  patch: Partial<Pick<Challenge, "title" | "dailyTarget" | "durationDays">>,
): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.updateChallenge(b.firestore, uid, challengeId, patch)
    : sb.updateChallengeSb(b.client, uid, challengeId, patch);
}

export function archiveChallenge(uid: string, challengeId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.archiveChallenge(b.firestore, uid, challengeId)
    : sb.archiveChallengeSb(b.client, uid, challengeId);
}

export function deleteChallenge(uid: string, challengeId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteChallenge(b.firestore, uid, challengeId)
    : sb.deleteChallengeSb(b.client, uid, challengeId);
}
