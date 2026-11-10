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
 */

const MAX_REDIRECTS = 3;

export class BlockedUrlError extends Error {
  constructor(message = "URL not allowed") {
    super(message);
    this.name = "BlockedUrlError";
  }
}

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (addr === "::" || addr === "::1") return true; // unspecified / loopback
  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms delegate to v4.
  const mapped = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return ipv4IsPrivate(mapped[1]!);
  if (addr.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(addr)) return true; // unique local fc00::/7
  if (addr.startsWith("ff")) return true; // multicast
  return false;
}

export function addressIsPrivate(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4IsPrivate(ip);
  if (family === 6) return ipv6IsPrivate(ip);
  return true; // not a parseable address — refuse rather than guess
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
