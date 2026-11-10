import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { boundedText, consumeAiQuota, guardErrorResponse, LIMITS } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";

const gradeSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe("How well the answer demonstrates correct understanding of the problem, from 0 (blank/completely wrong) to 10 (perfect)"),
  feedback: z
    .string()
    .describe("Concise, encouraging feedback — confirm what's right, or explain the gap if incorrect. 2-4 sentences."),
  hint: z
    .string()
    .optional()
    .describe(
      "Only when the score is below 7: a short, specific, actionable hint pointing at exactly what to reconsider — never the full answer",
    ),
  videoSearchQuery: z
    .string()
    .optional()
    .describe(
      "Only when the score is below 7: a focused YouTube search query (3-8 words) that would surface a good explainer video for the specific concept the learner is missing",
    ),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { drillId?: string; answer?: string };
  const drillId = typeof body.drillId === "string" ? body.drillId : undefined;
  let answer: string;
  try {
    answer = boundedText(body.answer, "answer", LIMITS.answer, { required: true })!;
    if (!drillId) return NextResponse.json({ error: "Missing drillId" }, { status: 400 });
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
  }

  const ref = adminDb.collection("users").doc(uid).collection("codeDrills").doc(drillId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Drill not found" }, { status: 404 });
  const drill = snap.data() as { prompt: string; explanation: string };

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: gradeSchema }),
      prompt:
        `A learner was given this coding drill:\n"${drill.prompt}"\n\n` +
        `The model solution/explanation is:\n"${drill.explanation}"\n\n` +
        `The learner's answer:\n"${answer}"\n\n` +
        "Score how well the answer demonstrates correct understanding, from 0 (blank/completely wrong) to 10 " +
        "(perfect) — it doesn't need to match the model solution word-for-word, just be substantively correct. " +
        "Give brief, encouraging feedback. If the score is below 7, also give a short, specific hint (never the " +
        "full answer) pointing at exactly what to reconsider, and a focused YouTube search query for a good " +
        "explainer video on the specific concept they're missing.",
    });

    const correct = output.score >= 7;
    const videoUrl = !correct && output.videoSearchQuery
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(output.videoSearchQuery)}`
      : null;
    const hint = correct ? null : (output.hint ?? null);

    await ref.set(
      { userAnswer: answer, graded: true, score: output.score, correct, feedback: output.feedback, hint, videoUrl },
      { merge: true },
    );
    return NextResponse.json({
      score: output.score,
      correct,
      feedback: output.feedback,
      hint: hint ?? undefined,
      videoUrl: videoUrl ?? undefined,
    });
  } catch (error) {
    console.error("knowledge/drill/grade failed", error);
    return NextResponse.json({ error: "Could not grade your answer" }, { status: 502 });
  }
}
