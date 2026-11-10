import { todayLessonId } from "@life-client/shared";
import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { consumeAiQuota, guardErrorResponse } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";

const lessonSchema = z.object({
  codeConcept: z.string().describe("Short name of a programming concept, e.g. 'Recursion'"),
  codeExplanation: z
    .string()
    .describe("A clear, beginner-friendly explanation of the concept, 3-6 sentences, with a tiny code example if useful"),
  word: z.string().describe("A single word in the required language — see language instruction in the prompt"),
  wordDefinition: z.string().describe("A one-sentence definition of the word, written in the word's own language"),
  wordExample: z.string().describe("An example sentence using the word naturally, written in the word's own language"),
});

// Real, public, keyless RSS feeds — no invented topic to validate afterward,
// since every candidate is already a genuinely published science/tech article.
const ARTICLE_FEEDS = [
  { source: "Quanta Magazine", url: "https://api.quantamagazine.org/feed/" },
  { source: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { source: "IEEE Spectrum", url: "https://spectrum.ieee.org/feeds/feed.rss" },
  { source: "Scientific American", url: "https://www.scientificamerican.com/platform/syndication/rss/" },
  { source: "New Scientist", url: "https://www.newscientist.com/feed/home/?cmpid=RSS" },
  { source: "Nature", url: "https://www.nature.com/nature.rss" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
];

const FEED_FETCH_TIMEOUT_MS = 6000;
const ITEMS_PER_FEED = 6;

interface ArticleCandidate {
  source: string;
  title: string;
  url: string;
}

const NAMED_XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

// A single combined pass — decoding named and numeric entities in separate
// sequential passes risks double-decoding (e.g. a literal "&amp;lt;" meant to
// display as "&lt;" would wrongly become "<" if amp were decoded first, then
// lt decoded on the result).
function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint =
        entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Every feed here is RSS 2.0 (or RSS 1.0/RDF, same `<item>` shape) with plain-text `<title>`/`<link>`. */
function parseRssItems(xml: string, source: string, max: number): ArticleCandidate[] {
  const items: ArticleCandidate[] = [];
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRegex = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i;

  for (const block of xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []) {
    const title = titleRegex.exec(block)?.[1]?.trim();
    const url = linkRegex.exec(block)?.[1]?.trim();
    if (!title || !url) continue;
    items.push({ source, title: decodeXmlEntities(title), url: decodeXmlEntities(url) });
    if (items.length >= max) break;
  }
  return items;
}

async function fetchFeedCandidates(feed: { source: string; url: string }): Promise<ArticleCandidate[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LifeClientBot/1.0)" },
      });
      if (!res.ok) return [];
      return parseRssItems(await res.text(), feed.source, ITEMS_PER_FEED);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

async function fetchArticleCandidates(excludeUrls: Set<string>): Promise<ArticleCandidate[]> {
  const perFeed = await Promise.all(ARTICLE_FEEDS.map(fetchFeedCandidates));
  return perFeed.flat().filter((c) => !excludeUrls.has(c.url));
}

const articlePickSchema = z.object({
  pickedIndex: z.number().int().describe("The index from the numbered list of the single best article to recommend today"),
  articleReason: z.string().describe("One sentence on why this article is worth reading today"),
});

async function pickArticle(
  candidates: ArticleCandidate[],
): Promise<{ topic: string; reason: string; url: string; source: string } | undefined> {
  if (candidates.length === 0) return undefined;

  const listing = candidates.map((c, i) => `${i}. [${c.source}] ${c.title}`).join("\n");

  try {
    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: articlePickSchema }),
      prompt:
        "A senior full-stack/Web3 developer wants one genuinely interesting science/tech article to read today. " +
        "Pick the single best one from this list of real, currently-published articles:\n\n" +
        `${listing}\n\n` +
        "Prefer substance over clickbait, and vary the topic/publication rather than always picking the same kind of story.",
    });
    const picked = candidates[output.pickedIndex];
    if (!picked) return undefined;
    return { topic: picked.title, reason: output.articleReason, url: picked.url, source: picked.source };
  } catch (error) {
    console.error("knowledge/lesson article pick failed", error);
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = todayLessonId();
  const ref = adminDb.collection("users").doc(uid).collection("dailyLessons").doc(lessonId);

  const existing = await ref.get();
  if (existing.exists && existing.data()?.articlePending !== true) {
    return NextResponse.json({ id: existing.id, ...existing.data() });
  }

  // Quota is consumed only when a lesson actually has to be generated — the
  // cached-lesson path above is free, so opening the app does not cost budget.
  try {
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
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
    const usedWords = historySnap.docs.map((d) => d.data().word as string).filter(Boolean);
    const recentArticleUrls = new Set(
      historySnap.docs.map((d) => d.data().articleUrl as string | undefined).filter((u): u is string => Boolean(u)),
    );
    const wordLanguage: "en" | "fr" = historySnap.size % 2 === 0 ? "en" : "fr";
    const languageName = wordLanguage === "fr" ? "French" : "English";

    const [{ output }, candidates] = await Promise.all([
      generateText({
        model: KNOWLEDGE_MODEL,
        temperature: 1,
        output: Output.object({ schema: lessonSchema }),
        prompt:
          "Generate today's learning lesson for a senior full-stack/Web3 developer who is a fluent bilingual " +
          "French/English speaker: one programming concept worth knowing (can be beginner or advanced — vary it), " +
          `and one genuinely rare/advanced ${languageName} word with its definition and an example sentence (all ` +
          `in ${languageName}). Keep everything concise and genuinely interesting, not generic.\n\n` +
          `The word MUST be a word that would challenge an educated, well-read fluent ${languageName} speaker — ` +
          "NOT a common 'word of the day' listicle entry that most fluent/bilingual people already know. For " +
          "example, these are all TOO EASY and must not be used: defenestration, papillonner, retrouvailles, " +
          "dépaysement, serendipity, ephemeral. Go for genuinely obscure, literary, archaic, or highly " +
          "specialized vocabulary instead.\n\n" +
          (usedWords.length > 0 ? `Do NOT reuse any of these already-given words: ${usedWords.join(", ")}.\n` : "") +
          (recentConcepts.length > 0
            ? `Do NOT repeat any of these already-covered code concepts: ${recentConcepts.join(", ")}.`
            : ""),
      }),
      fetchArticleCandidates(recentArticleUrls),
    ]);

    const article = await pickArticle(candidates);

    const lesson = {
      ...output,
      wordLanguage,
      articleTopic: article?.topic ?? "No article available today",
      articleReason:
        article?.reason ?? "Couldn't reach any science/tech feeds just now — try generating again in a bit.",
      articleSource: article?.source,
      articleUrl: article?.url,
      // Marks a lesson whose article lookup failed. The early-return above
      // skips these, so the "try generating again" the UI promises actually
      // works — previously that text was cached under the day's id forever and
      // still counted toward lesson XP and the streak.
      articlePending: article ? false : true,
    };
    const createdAt = new Date().toISOString();

    // `create` rather than `set`: two concurrent requests used to each write a
    // full lesson and each append a reading-list item, so the client holding
    // response A displayed a lesson Firestore no longer had. Losing the race
    // now means returning the lesson that won it.
    const batch = adminDb.batch();
    // `set` when replacing our own pending placeholder, `create` otherwise.
    if (existing.exists) batch.set(ref, { ...lesson, createdAt });
    else batch.create(ref, { ...lesson, createdAt });
    if (article) {
      // Batched with the lesson so the reading-list item cannot be lost while
      // the lesson is kept — previously a failure here returned 502 even
      // though the lesson had already been written, and the retry
      // short-circuited on `existing.exists`, losing the article for that day.
      batch.create(adminDb.collection("users").doc(uid).collection("readingList").doc(), {
        url: article.url,
        title: article.topic,
        status: "pending",
        createdAt,
        updatedAt: createdAt,
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      // ALREADY_EXISTS (code 6) means a concurrent request got there first.
      if ((error as { code?: number }).code === 6) {
        const winner = await ref.get();
        if (winner.exists) return NextResponse.json({ id: winner.id, ...winner.data() });
      }
      throw error;
    }

    return NextResponse.json({ id: lessonId, ...lesson, createdAt });
  } catch (error) {
    console.error("knowledge/lesson generation failed", error);
    return NextResponse.json({ error: "Could not generate today's lesson" }, { status: 502 });
  }
}
