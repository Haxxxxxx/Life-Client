import { describe, expect, it } from "vitest";
import { addressIsPrivate, ipv6ToBytes, parseIpv4 } from "./netAddress";

const hex = (b: Uint8Array | null) =>
  b === null ? null : [...b].map((n) => n.toString(16).padStart(2, "0")).join("");

describe("parseIpv4", () => {
  it("accepts ordinary dotted quads", () => {
    expect(parseIpv4("127.0.0.1")).toEqual([127, 0, 0, 1]);
    expect(parseIpv4("255.255.255.255")).toEqual([255, 255, 255, 255]);
  });

  it("rejects leading zeros, which different resolvers read differently", () => {
    // "0177.0.0.1" is octal 127.0.0.1 to some stacks and invalid to others. A
    // guard that disagrees with whatever opens the socket is no guard.
    expect(parseIpv4("0177.0.0.1")).toBeNull();
    expect(parseIpv4("127.0.0.01")).toBeNull();
  });

  it("rejects out-of-range, short and non-numeric forms", () => {
    expect(parseIpv4("256.0.0.1")).toBeNull();
    expect(parseIpv4("127.0.1")).toBeNull();
    expect(parseIpv4("2130706433")).toBeNull();
    expect(parseIpv4("127.0.0.x")).toBeNull();
  });
});

describe("ipv6ToBytes", () => {
  it("reduces every spelling of one address to the same bytes", () => {
    const loopbackMapped = "00000000000000000000ffff7f000001";
    expect(hex(ipv6ToBytes("::ffff:127.0.0.1"))).toBe(loopbackMapped);
    expect(hex(ipv6ToBytes("::ffff:7f00:1"))).toBe(loopbackMapped);
    expect(hex(ipv6ToBytes("0:0:0:0:0:ffff:7f00:1"))).toBe(loopbackMapped);
    expect(hex(ipv6ToBytes("[::ffff:7f00:1]"))).toBe(loopbackMapped);
    expect(hex(ipv6ToBytes("::FFFF:7F00:1"))).toBe(loopbackMapped);
  });

  it("expands compression and plain literals", () => {
    expect(hex(ipv6ToBytes("::1"))).toBe("00000000000000000000000000000001");
    expect(hex(ipv6ToBytes("::"))).toBe("00000000000000000000000000000000");
    expect(hex(ipv6ToBytes("fd00::1"))).toBe("fd000000000000000000000000000001");
  });

  it("strips a zone index", () => {
    expect(hex(ipv6ToBytes("fe80::1%eth0"))).toBe("fe800000000000000000000000000001");
  });

  it("rejects malformed literals rather than guessing", () => {
    expect(ipv6ToBytes("1::2::3")).toBeNull();
    expect(ipv6ToBytes("12345::1")).toBeNull();
    expect(ipv6ToBytes("1:2:3:4:5:6:7")).toBeNull();
    expect(ipv6ToBytes("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(ipv6ToBytes("127.0.0.1")).toBeNull();
    expect(ipv6ToBytes("")).toBeNull();
    expect(ipv6ToBytes("::ffff:999.0.0.1")).toBeNull();
  });
});

describe("addressIsPrivate", () => {
  it("blocks IPv4 loopback, private, link-local and CGNAT ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "172.15.0.1"]) {
      expect(addressIsPrivate(ip), ip).toBe(false);
    }
  });

  it("blocks the hex spelling of a mapped address, not just the dotted one", () => {
    // The bypass this module was written for. ::ffff:a9fe:a9fe is
    // 169.254.169.254 — the cloud metadata endpoint — and the previous
    // prefix-matching guard allowed it.
    expect(addressIsPrivate("::ffff:127.0.0.1")).toBe(true);
    expect(addressIsPrivate("::ffff:7f00:1")).toBe(true);
    expect(addressIsPrivate("::ffff:a9fe:a9fe")).toBe(true);
    expect(addressIsPrivate("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(addressIsPrivate("[::ffff:a9fe:a9fe]")).toBe(true);
  });

  it("blocks IPv6 loopback, unspecified, link-local, ULA and multicast", () => {
    for (const ip of ["::1", "::", "fe80::1", "fe80::", "febf::1", "fc00::1", "fd00::1", "ff02::1"]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });

  it("blocks the deprecated IPv4-compatible form outright", () => {
    expect(addressIsPrivate("::7f00:1")).toBe(true);
    expect(addressIsPrivate("::127.0.0.1")).toBe(true);
    expect(addressIsPrivate("::8.8.8.8")).toBe(true);
  });

  it("blocks NAT64 that would translate to a private IPv4", () => {
    expect(addressIsPrivate("64:ff9b::7f00:1")).toBe(true);
    expect(addressIsPrivate("64:ff9b::169.254.169.254")).toBe(true);
  });

  it("allows ordinary public IPv6", () => {
    for (const ip of ["2606:4700:4700::1111", "2001:4860:4860::8888", "64:ff9b::8.8.8.8"]) {
      expect(addressIsPrivate(ip), ip).toBe(false);
    }
  });

  it("refuses anything it cannot parse rather than letting it through", () => {
    for (const ip of ["", "not-an-ip", "example.com", "127.0.0.1.nip.io", "0177.0.0.1", "2130706433"]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });
});
