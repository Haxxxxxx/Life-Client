import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { consumeAiQuota, guardErrorResponse } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";

const vocabSchema = z.object({
  word: z.string().describe("A single uncommon-but-useful English word"),
  definition: z.string().describe("A one-sentence definition"),
  example: z.string().describe("An example sentence using the word naturally"),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
  }

  const existingSnap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("vocabWords")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const existingWords = existingSnap.docs
    .map((d) => d.data().word as string | undefined)
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.toLowerCase());

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: vocabSchema }),
      prompt:
        "Suggest one interesting, uncommon-but-useful English word to learn today, with a definition and " +
        `example sentence. Do not repeat any of these already-learned words: ${existingWords.join(", ") || "(none yet)"}.`,
    });

    const ref = adminDb.collection("users").doc(uid).collection("vocabWords").doc();
    const now = new Date().toISOString();
    const word = { ...output, mastery: "new" as const, createdAt: now, updatedAt: now };
    await ref.set(word);
    return NextResponse.json({ id: ref.id, ...word });
  } catch (error) {
    console.error("knowledge/vocab generation failed", error);
    return NextResponse.json({ error: "Could not generate a new word" }, { status: 502 });
  }
}
