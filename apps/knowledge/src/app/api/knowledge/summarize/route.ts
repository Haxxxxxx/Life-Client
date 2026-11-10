import { Output, generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/server/admin";
import { KNOWLEDGE_MODEL } from "@/lib/server/aiModel";
import { consumeAiQuota, guardErrorResponse } from "@/lib/server/aiGuards";
import { requireUid } from "@/lib/server/requireAuth";
import { BlockedUrlError, safeFetchText } from "@/lib/server/safeFetch";

const MAX_ARTICLE_CHARS = 8000;
const FETCH_TIMEOUT_MS = 8000;
// Hard cap on the downloaded body; the readable-text slice happens after.
const MAX_FETCH_BYTES = 2_000_000;

const summarySchema = z.object({
  title: z.string().describe("The article's title"),
  summary: z.string().describe("A concise 2-4 sentence summary of the article"),
  keyTakeaways: z.array(z.string()).describe("3-5 short bullet-point key takeaways"),
});

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
  try {
    await consumeAiQuota(uid);
  } catch (error) {
    const guard = guardErrorResponse(error);
    if (guard) return NextResponse.json({ error: guard.error }, { status: guard.status });
    throw error;
  }

  try {
    // safeFetchText resolves DNS, rejects private/loopback/link-local targets,
    // follows redirects manually so every hop is re-checked, and caps the body
    // size instead of buffering the whole response.
    const html = await safeFetchText(parsedUrl.toString(), {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_FETCH_BYTES,
      userAgent: "Mozilla/5.0 (compatible; LifeClientBot/1.0)",
    });
    const articleText = extractReadableText(html);

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
    // The detail goes to the server log only. This message is persisted onto a
    // client-readable document, so it must not carry internal fetch/SDK text.
    console.error("knowledge/summarize failed", error);
    const message =
      error instanceof BlockedUrlError ? error.message : "Could not summarize this article";
    const status = error instanceof BlockedUrlError ? 400 : 502;
    await ref.update({ status: "error", error: message, updatedAt: new Date().toISOString() });
    return NextResponse.json({ error: message }, { status });
  }
}
