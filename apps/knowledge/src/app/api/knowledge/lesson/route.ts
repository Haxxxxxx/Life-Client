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
  word: z.string().describe("A single word in the required language — see language instruction in the prompt"),
  wordDefinition: z.string().describe("A one-sentence definition of the word, written in the word's own language"),
  wordExample: z.string().describe("An example sentence using the word naturally, written in the word's own language"),
  articleTopic: z.string().describe("A specific, interesting topic worth reading an article about today"),
  articleReason: z.string().describe("One sentence on why this topic is worth reading about"),
});

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "with", "for", "to", "in", "on", "at", "is", "are",
  "path", "forward", "understanding", "how", "why", "what", "new", "modern",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

/**
 * Finds a real Wikipedia article matching the topic — no API key needed.
 * Wikipedia's search reliably returns *some* result even for very specific
 * AI-coined topics (e.g. "intent-centric protocols") with no real matching
 * page, defaulting to an essentially unrelated top hit — so this rejects any
 * result that doesn't share at least one substantive word with the topic,
 * rather than link to something wrong.
 */
async function findWikipediaUrl(topic: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=1&origin=*`,
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { query?: { search?: { title: string }[] } };
    const title = data.query?.search?.[0]?.title;
    if (!title) return undefined;

    const topicWords = significantWords(topic);
    const titleWords = significantWords(title);
    const hasOverlap = [...titleWords].some((w) => topicWords.has(w));
    if (!hasOverlap) return undefined;

    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  } catch {
    return undefined;
  }
}

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
    // The model has no memory across requests, so without an exclusion list
    // it reliably converges on the same handful of high-probability answers
    // (e.g. "Homomorphic Encryption" / "defenestration" / "papillonner") every
    // single time. Pull the user's full history to exclude, and alternate the
    // word's language deterministically in code rather than trusting the
    // model to self-balance it.
    const historySnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("dailyLessons")
      .orderBy("createdAt", "desc")
      .get();
    const recentConcepts = historySnap.docs.map((d) => d.data().codeConcept as string).filter(Boolean);
    const recentTopics = historySnap.docs.map((d) => d.data().articleTopic as string).filter(Boolean);
    const usedWords = historySnap.docs.map((d) => d.data().word as string).filter(Boolean);
    const wordLanguage: "en" | "fr" = historySnap.size % 2 === 0 ? "en" : "fr";
    const languageName = wordLanguage === "fr" ? "French" : "English";

    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      temperature: 1,
      output: Output.object({ schema: lessonSchema }),
      prompt:
        "Generate today's learning lesson for a senior full-stack/Web3 developer who is a fluent bilingual " +
        "French/English speaker: one programming concept worth knowing (can be beginner or advanced — vary it), " +
        `one genuinely rare/advanced ${languageName} word with its definition and an example sentence (all in ` +
        `${languageName}), and one specific article topic worth reading about today (tech, science, or general ` +
        "knowledge). Keep everything concise and genuinely interesting, not generic.\n\n" +
        `The word MUST be a word that would challenge an educated, well-read fluent ${languageName} speaker — ` +
        "NOT a common 'word of the day' listicle entry that most fluent/bilingual people already know. For " +
        "example, these are all TOO EASY and must not be used: defenestration, papillonner, retrouvailles, " +
        "dépaysement, serendipity, ephemeral. Go for genuinely obscure, literary, archaic, or highly " +
        "specialized vocabulary instead.\n\n" +
        (usedWords.length > 0 ? `Do NOT reuse any of these already-given words: ${usedWords.join(", ")}.\n` : "") +
        (recentConcepts.length > 0
          ? `Do NOT repeat any of these already-covered code concepts: ${recentConcepts.join(", ")}.\n`
          : "") +
        (recentTopics.length > 0
          ? `Do NOT repeat any of these already-suggested article topics: ${recentTopics.join(", ")}.`
          : ""),
    });

    const articleUrl = await findWikipediaUrl(output.articleTopic);

    const lesson = { ...output, wordLanguage, articleUrl };
    const createdAt = new Date().toISOString();
    await ref.set({ ...lesson, createdAt });

    // Only when a genuinely relevant article was found — Reading List summaries
    // fetch and summarize the URL's real content, so an entry with no article
    // behind it would just error out.
    if (articleUrl) {
      await adminDb
        .collection("users")
        .doc(uid)
        .collection("readingList")
        .add({
          url: articleUrl,
          title: output.articleTopic,
          status: "pending",
          createdAt,
          updatedAt: createdAt,
        });
    }

    return NextResponse.json({ id: lessonId, ...lesson, createdAt });
  } catch (error) {
    console.error("knowledge/lesson generation failed", error);
    return NextResponse.json({ error: "Could not generate today's lesson" }, { status: 502 });
  }
}
