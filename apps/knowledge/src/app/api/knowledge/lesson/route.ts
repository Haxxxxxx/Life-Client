import { todayLessonId } from "@life-client/shared";
import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { requireUid } from "@/lib/server/requireAuth";

const lessonSchema = z.object({
  codeConcept: z.string().describe("Short name of a programming concept, e.g. 'Recursion'"),
  codeExplanation: z
    .string()
    .describe("A clear, beginner-friendly explanation of the concept, 3-6 sentences, with a tiny code example if useful"),
  word: z.string().describe("An interesting English word most people wouldn't know"),
  wordDefinition: z.string().describe("A one-sentence definition of the word"),
  wordExample: z.string().describe("An example sentence using the word"),
  articleTopic: z.string().describe("A specific, interesting topic worth reading an article about today"),
  articleReason: z.string().describe("One sentence on why this topic is worth reading about"),
});

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = todayLessonId();
  const ref = adminDb.collection("users").doc(uid).collection("dailyLessons").doc(lessonId);

  const existing = await ref.get();
  if (existing.exists) {
    return NextResponse.json({ id: existing.id, ...existing.data() });
  }

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: lessonSchema }),
      prompt:
        "Generate today's learning lesson for a senior full-stack/Web3 developer: one programming concept " +
        "worth knowing (can be beginner or advanced — vary it), one uncommon-but-useful English word, and one " +
        "specific article topic worth reading about today (tech, science, or general knowledge). Keep everything " +
        "concise and genuinely interesting, not generic.",
    });

    const createdAt = new Date().toISOString();
    await ref.set({ ...output, createdAt });
    return NextResponse.json({ id: lessonId, ...output, createdAt });
  } catch (error) {
    console.error("knowledge/lesson generation failed", error);
    return NextResponse.json({ error: "Could not generate today's lesson" }, { status: 502 });
  }
}
