import type { CodeDrillDifficulty } from "@life-client/shared";
import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { boundedText, consumeAiQuota, guardErrorResponse, LIMITS } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";

const DIFFICULTIES: CodeDrillDifficulty[] = ["beginner", "intermediate", "advanced"];

const drillSchema = z.object({
  prompt: z.string().describe("The coding logic problem or concept question posed to the learner"),
  explanation: z
    .string()
    .describe("The full explanation / model answer / worked solution, including a code snippet if useful"),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { topic?: string; difficulty?: string };
  const difficulty: CodeDrillDifficulty = DIFFICULTIES.includes(body.difficulty as CodeDrillDifficulty)
    ? (body.difficulty as CodeDrillDifficulty)
    : "intermediate";

  let topic: string;
  try {
    topic = boundedText(body.topic, "topic", LIMITS.topic) ?? "any topic you choose";
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
  }

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: drillSchema }),
      prompt:
        `Generate one ${difficulty}-level coding logic drill about: ${topic}. ` +
        "Pose a specific problem or 'explain X' question the learner should think through, " +
        "then give the full explanation/solution separately. Keep it focused and practical.",
    });

    const ref = adminDb.collection("users").doc(uid).collection("codeDrills").doc();
    const createdAt = new Date().toISOString();
    const drill = { topic, difficulty, ...output, createdAt };
    await ref.set(drill);
    return NextResponse.json({ id: ref.id, ...drill });
  } catch (error) {
    console.error("knowledge/drill generation failed", error);
    return NextResponse.json({ error: "Could not generate a drill" }, { status: 502 });
  }
}
