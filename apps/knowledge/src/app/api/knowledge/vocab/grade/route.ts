import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { boundedText, consumeAiQuota, guardErrorResponse, LIMITS } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";

const gradeSchema = z.object({
  correct: z.boolean().describe("Whether the sentence uses the word correctly and naturally"),
  feedback: z
    .string()
    .describe("Concise, encouraging feedback — confirm correct usage, or explain what's off if not. 1-3 sentences."),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { wordId?: string; sentence?: string };
  const wordId = typeof body.wordId === "string" ? body.wordId : undefined;
  let sentence: string;
  try {
    sentence = boundedText(body.sentence, "sentence", LIMITS.sentence, { required: true })!;
    if (!wordId) return NextResponse.json({ error: "Missing wordId" }, { status: 400 });
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
  }

  const ref = adminDb.collection("users").doc(uid).collection("vocabWords").doc(wordId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Word not found" }, { status: 404 });
  const vocabWord = snap.data() as { word: string; definition: string };

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: gradeSchema }),
      // Deterministic grading: at the default temperature, resubmitting the
      // same answer returned a different score each time, so a learner could
      // re-roll for a better one.
      temperature: 0,
      prompt:
        `The word "${vocabWord.word}" means: "${vocabWord.definition}".\n\n` +
        `A learner wrote this sentence to practice using it:\n"${sentence}"\n\n` +
        "Judge whether the sentence uses the word correctly, naturally, and in a way that shows real " +
        "understanding of its meaning. Give brief, encouraging feedback.",
    });

    // See drill/grade: a merging set would resurrect a word deleted during the
    // model call as a doc with no createdAt, invisible to every ordered query.
    await ref.update({
      practiceSentence: sentence,
      practiceCorrect: output.correct,
      practiceFeedback: output.feedback,
    });
    return NextResponse.json({ correct: output.correct, feedback: output.feedback });
  } catch (error) {
    console.error("knowledge/vocab/grade failed", error);
    return NextResponse.json({ error: "Could not grade your sentence" }, { status: 502 });
  }
}
