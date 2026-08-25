import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { requireUid } from "@/lib/server/requireAuth";

const MAX_ARTICLE_CHARS = 8000;
const FETCH_TIMEOUT_MS = 8000;

const summarySchema = z.object({
  title: z.string().describe("The article's title"),
  summary: z.string().describe("A concise 2-4 sentence summary of the article"),
  keyTakeaways: z.array(z.string()).describe("3-5 short bullet-point key takeaways"),
});

// Private/loopback/link-local ranges — refuse to let this server-side fetch be
// used as an SSRF vector to reach internal services or cloud metadata endpoints.
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
];

function isBlockedUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname));
}

function extractReadableText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const collapsed = withoutTags.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_ARTICLE_CHARS);
}

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { itemId?: string };
  const itemId = body.itemId;
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const ref = adminDb.collection("users").doc(uid).collection("readingList").doc(itemId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = snap.data()?.url as string | undefined;
  if (!url) return NextResponse.json({ error: "Item has no url" }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    await ref.update({ status: "error", error: "Invalid URL", updatedAt: new Date().toISOString() });
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (isBlockedUrl(parsedUrl)) {
    await ref.update({ status: "error", error: "URL not allowed", updatedAt: new Date().toISOString() });
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let articleText: string;
    try {
      const response = await fetch(parsedUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LifeClientBot/1.0)" },
      });
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const html = await response.text();
      articleText = extractReadableText(html);
    } finally {
      clearTimeout(timeout);
    }

    if (!articleText) throw new Error("Could not extract any readable content from the page");

    const { output } = await generateText({
      model: KNOWLEDGE_MODEL,
      output: Output.object({ schema: summarySchema }),
      prompt: `Summarize this article for someone deciding whether to read it in full.\n\nURL: ${url}\n\nContent:\n${articleText}`,
    });

    const updatedAt = new Date().toISOString();
    await ref.update({ ...output, status: "summarized", error: null, updatedAt });
    return NextResponse.json({ id: itemId, url, status: "summarized", ...output, updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not summarize this article";
    console.error("knowledge/summarize failed", error);
    await ref.update({ status: "error", error: message, updatedAt: new Date().toISOString() });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
