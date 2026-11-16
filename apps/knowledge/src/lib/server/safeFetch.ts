// Importing this module from a Client Component is a build error, not a runtime
// surprise. Everything in lib/server/ touches firebase-admin via a service
// account and (soon) a Supabase service-role key; previously the boundary was
// held by convention alone, so one bad import would have bundled credentials
// into the browser. admin.ts initialises lazily, so the mistake would not even
// have thrown until first use.
import "server-only";

import { addressIsPrivate } from "@life-client/shared";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches a user-supplied URL with SSRF protections.
 *
 * The previous filter matched a regex against `url.hostname`, which only stops
 * an attacker who spells the target in the obvious way. It missed:
 *
 *   - names that *resolve* to a private address (`127.0.0.1.nip.io`, or an
 *     attacker-controlled record pointing at 169.254.169.254)
 *   - non-dotted IPv4 (`http://2130706433/`) and IPv6 (`[::ffff:127.0.0.1]`,
 *     `[fd00::]`)
 *   - redirects — `fetch` follows them by default, so any public URL that
 *     302s to an internal host walked straight through the check
 *
 * So the check has to be on the resolved address, and it has to run again on
 * every hop. The body is also read with a hard byte cap, because the old code
 * buffered the whole response before slicing it.
 *
 * The address classification itself lives in packages/shared/netAddress, where
 * it is tested against a table of literals. It used to live here and matched
 * IPv6 by string prefix, which was worse than it looked: WHATWG `URL`
 * canonicalises an IPv6 host to compressed hex, so `[::ffff:127.0.0.1]`
 * arrives as `[::ffff:7f00:1]` and the dotted-form branch could never match a
 * parsed URL at all. Every IPv4-mapped address was allowed through, metadata
 * endpoints included.
 */

const MAX_REDIRECTS = 3;

export class BlockedUrlError extends Error {
  constructor(message = "URL not allowed") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Resolves the host and rejects unless every address it maps to is public. */
async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https URLs can be summarized");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");

  // A literal address needs no DNS, but still needs checking.
  if (isIP(host)) {
    if (addressIsPrivate(host)) throw new BlockedUrlError();
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("Could not resolve that host");
  }
  if (addresses.length === 0) throw new BlockedUrlError("Could not resolve that host");
  // Every address, not just the first: a host that resolves to both a public
  // and a private address must not be reachable through this endpoint.
  if (addresses.some((a) => addressIsPrivate(a.address))) throw new BlockedUrlError();
}

/** Reads at most `maxBytes`, aborting instead of buffering a huge body. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      chunks.push(value);
      if (total >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged.subarray(0, maxBytes));
}

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent?: string;
}

/**
 * Follows redirects manually, re-validating the destination of every hop.
 * Returns the decoded body, truncated to `maxBytes`.
 */
export async function safeFetchText(rawUrl: string, options: SafeFetchOptions): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("Invalid URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);

      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual", // the whole point: inspect each hop ourselves
        headers: { "User-Agent": options.userAgent ?? "LifeClientBot/1.0" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect with no location (${response.status})`);
        // Resolve relative redirects against the current hop.
        url = new URL(location, url);
        continue;
      }

      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      return await readCapped(response, options.maxBytes);
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}
