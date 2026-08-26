import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { requireUid } from "@/lib/server/requireAuth";

const gradeSchema = z.object({
  correct: z.boolean().describe("Whether the answer demonstrates correct understanding of the problem"),
  feedback: z
    .string()
    .describe("Concise, encouraging feedback — confirm what's right, or explain the gap if incorrect. 2-4 sentences."),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { drillId?: string; answer?: string };
  const drillId = typeof body.drillId === "string" ? body.drillId : undefined;
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!drillId || !answer) {
    return NextResponse.json({ error: "Missing drillId or answer" }, { status: 400 });
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
        "Judge whether the learner's answer demonstrates correct understanding — it doesn't need to match " +
        "the model solution word-for-word, just be substantively correct. Give brief, encouraging feedback.",
    });

    await ref.set(
      { userAnswer: answer, graded: true, correct: output.correct, feedback: output.feedback },
      { merge: true },
    );
    return NextResponse.json({ correct: output.correct, feedback: output.feedback });
  } catch (error) {
    console.error("knowledge/drill/grade failed", error);
    return NextResponse.json({ error: "Could not grade your answer" }, { status: 502 });
  }
}
