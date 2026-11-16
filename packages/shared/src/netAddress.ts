/**
 * Classifies IP addresses as private (not safely reachable from a server that
 * fetches user-supplied URLs) or public.
 *
 * This is the decision an SSRF guard turns on, so it is written against the
 * address *bytes* rather than against the text. The previous version matched
 * string prefixes, which blocked `::ffff:127.0.0.1` but allowed the very same
 * address written in hex — `::ffff:7f00:1` — and, worse, allowed
 * `::ffff:a9fe:a9fe`, the cloud metadata endpoint the guard exists to protect.
 *
 * Everything unparseable is reported private. A guard that refuses an address
 * it cannot understand fails closed; one that guesses fails open.
 *
 * Pure and dependency-free on purpose: it lives here rather than beside the
 * fetch helper so it can be tested exhaustively against a table of literals,
 * which is the only way a classifier like this stays correct.
 */

/** Parses dotted-quad IPv4 into its four octets, or null if it isn't one. */
export function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    // Leading zeros are rejected rather than normalised: "0177.0.0.1" is read
    // as octal by some resolvers and as decimal by others, and a guard must
    // not disagree with whatever eventually opens the socket.
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

function ipv4OctetsArePrivate(a: number, b: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** True for any IPv4 address a server should refuse to fetch from. */
export function ipv4IsPrivate(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return true;
  return ipv4OctetsArePrivate(octets[0], octets[1]);
}

/**
 * Expands an IPv6 literal to its 16 bytes, or null if it is not one.
 *
 * Handles `::` compression, a trailing embedded IPv4 (`::ffff:1.2.3.4`), zone
 * indices and surrounding brackets, so every spelling of one address reduces
 * to the same bytes.
 */
export function ipv6ToBytes(input: string): Uint8Array | null {
  let s = input.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (s.length === 0 || !s.includes(":")) return null;

  // A trailing dotted-quad is rewritten as the two hex groups it stands for,
  // in place. Cutting it off instead would leave a dangling ":" and turn a
  // valid literal into an unparseable one.
  const lastColon = s.lastIndexOf(":");
  const tailText = s.slice(lastColon + 1);
  if (tailText.includes(".")) {
    const v4 = parseIpv4(tailText);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const headText = halves[0] ?? "";
  const tailTextGroups = halves.length === 2 ? (halves[1] ?? "") : null;

  const parseGroups = (text: string): number[] | null => {
    if (text === "") return [];
    const out: number[] = [];
    for (const g of text.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parseGroups(headText);
  const tail = tailTextGroups === null ? [] : parseGroups(tailTextGroups);
  if (head === null || tail === null) return null;

  const groups = [...head, ...tail];
  let full: number[];
  if (tailTextGroups === null) {
    if (groups.length !== 8) return null;
    full = groups;
  } else {
    const gap = 8 - groups.length;
    if (gap < 1) return null;
    full = [...head, ...Array(gap).fill(0), ...tail];
  }
  if (full.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = full[i]!;
    bytes[i * 2] = (g >> 8) & 0xff;
    bytes[i * 2 + 1] = g & 0xff;
  }
  return bytes;
}

/** True for any IPv6 address a server should refuse to fetch from. */
export function ipv6IsPrivate(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  if (!b) return true;
  const zeroThrough = (n: number) => b.slice(0, n).every((x) => x === 0);

  // ::ffff:0:0/96 — IPv4-mapped. The embedded address decides, whether it was
  // written in dotted or hex form.
  if (zeroThrough(10) && b[10] === 0xff && b[11] === 0xff) {
    return ipv4OctetsArePrivate(b[12]!, b[13]!);
  }
  // ::/96 covers ::, ::1 and the deprecated IPv4-compatible form. All refused:
  // the format is obsolete and survives mainly as a filter bypass.
  if (zeroThrough(12)) return true;
  // 64:ff9b::/96 — NAT64. Translated to the embedded IPv4 on the way out.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return ipv4OctetsArePrivate(b[12]!, b[13]!);
  }
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/**
 * True for any address a server should refuse to fetch from.
 *
 * Anything that is not a recognisable IPv4 or IPv6 literal is reported
 * private, so a caller cannot accidentally treat a hostname as checked.
 */
export function addressIsPrivate(ip: string): boolean {
  const bare = ip.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (bare.includes(":")) return ipv6IsPrivate(bare);
  if (parseIpv4(bare)) return ipv4IsPrivate(bare);
  return true;
}
