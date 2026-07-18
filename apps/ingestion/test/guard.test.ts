import { describe, expect, it } from "vitest";

import {
  checkActualLength,
  checkDeclaredLength,
  checkMagicNumber,
  checkResolvedAddress,
  checkSourceUrl,
  DEFAULT_MAX_BYTES,
} from "../src/fetch/guard";

const ALLOW = ["mlit.go.jp", "nilim.go.jp", "buildingsmart.org"];

describe("checkSourceUrl", () => {
  it("accepts allowlisted https hosts and their subdomains", () => {
    expect(checkSourceUrl("https://www.mlit.go.jp/tec/x.pdf", ALLOW).ok).toBe(true);
    expect(
      checkSourceUrl("https://technical.buildingsmart.org/standards/", ALLOW).ok,
    ).toBe(true);
    expect(checkSourceUrl("https://mlit.go.jp/", ALLOW).ok).toBe(true);
  });

  it("rejects http, non-default ports and embedded credentials", () => {
    expect(checkSourceUrl("http://www.mlit.go.jp/", ALLOW)).toEqual({
      ok: false,
      reason: "https_required",
    });
    expect(checkSourceUrl("https://www.mlit.go.jp:8443/", ALLOW)).toEqual({
      ok: false,
      reason: "non_default_port",
    });
    expect(checkSourceUrl("https://user:pw@www.mlit.go.jp/", ALLOW)).toEqual({
      ok: false,
      reason: "credentials_in_url",
    });
  });

  it("rejects hosts outside the allowlist including suffix tricks", () => {
    expect(checkSourceUrl("https://example.com/", ALLOW).ok).toBe(false);
    // evil-mlit.go.jp.example.com must not match mlit.go.jp
    expect(checkSourceUrl("https://mlit.go.jp.evil.example.com/", ALLOW).ok).toBe(
      false,
    );
    // prefix similarity is not membership
    expect(checkSourceUrl("https://notmlit.go.jp/", ALLOW).ok).toBe(false);
  });

  it("rejects IP literals (SSRF)", () => {
    expect(checkSourceUrl("https://192.168.1.10/spec.pdf", ALLOW)).toEqual({
      ok: false,
      reason: "ip_literal_rejected",
    });
    expect(checkSourceUrl("https://[2001:db8::1]/x", ALLOW)).toEqual({
      ok: false,
      reason: "ip_literal_rejected",
    });
  });

  it("rejects garbage", () => {
    expect(checkSourceUrl("not a url", ALLOW).ok).toBe(false);
    expect(checkSourceUrl("https://", ALLOW).ok).toBe(false);
  });
});

describe("length guards", () => {
  it("accepts absent or in-limit declared lengths", () => {
    expect(checkDeclaredLength(null).ok).toBe(true);
    expect(checkDeclaredLength(1024).ok).toBe(true);
  });

  it("rejects oversize or invalid declarations", () => {
    expect(checkDeclaredLength(DEFAULT_MAX_BYTES + 1).ok).toBe(false);
    expect(checkDeclaredLength(-1).ok).toBe(false);
    expect(checkDeclaredLength(Number.NaN).ok).toBe(false);
  });

  it("verifies the actual body against both the limit and the declaration", () => {
    expect(checkActualLength(100, 100).ok).toBe(true);
    expect(checkActualLength(100, null).ok).toBe(true);
    expect(checkActualLength(100, 99)).toEqual({
      ok: false,
      reason: "length_mismatch",
    });
    expect(checkActualLength(DEFAULT_MAX_BYTES + 1, null)).toEqual({
      ok: false,
      reason: "body_exceeds_limit",
    });
  });
});

describe("checkMagicNumber", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

  it("verifies fingerprintable types", () => {
    expect(checkMagicNumber(pdf, "application/pdf").ok).toBe(true);
    expect(checkMagicNumber(zip, "application/zip").ok).toBe(true);
    expect(checkMagicNumber(zip, "application/pdf")).toEqual({
      ok: false,
      reason: "magic_mismatch_pdf",
    });
    expect(checkMagicNumber(pdf, "application/zip")).toEqual({
      ok: false,
      reason: "magic_mismatch_zip",
    });
  });

  it("passes through non-fingerprintable types (parser revalidates)", () => {
    const html = new TextEncoder().encode("<!doctype html>");
    expect(checkMagicNumber(html, "text/html; charset=utf-8").ok).toBe(true);
    expect(checkMagicNumber(html, "application/json").ok).toBe(true);
  });
});

describe("checkActualLength input validation", () => {
  it("rejects non-integer or negative actual sizes", () => {
    expect(checkActualLength(-1, null)).toEqual({
      ok: false,
      reason: "invalid_actual_length",
    });
    expect(checkActualLength(1.5, null).ok).toBe(false);
    expect(checkActualLength(Number.NaN, null).ok).toBe(false);
    expect(checkActualLength(Number.POSITIVE_INFINITY, null).ok).toBe(false);
  });
});

describe("checkMagicNumber full signatures", () => {
  it("requires the full %PDF- header", () => {
    const truncated = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(checkMagicNumber(truncated, "application/pdf").ok).toBe(false);
  });

  it("accepts all three ZIP signature variants and rejects bare PK", () => {
    const standard = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const empty = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);
    const spanned = new Uint8Array([0x50, 0x4b, 0x07, 0x08]);
    const barePk = new Uint8Array([0x50, 0x4b, 0x00, 0x00]);
    expect(checkMagicNumber(standard, "application/zip").ok).toBe(true);
    expect(checkMagicNumber(empty, "application/zip").ok).toBe(true);
    expect(checkMagicNumber(spanned, "application/zip").ok).toBe(true);
    expect(checkMagicNumber(barePk, "application/zip").ok).toBe(false);
  });
});

describe("checkResolvedAddress", () => {
  it("rejects loopback, private, link-local, CGN and reserved IPv4 ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.185",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(checkResolvedAddress(ip).ok, ip).toBe(false);
    }
  });

  it("accepts public IPv4 addresses", () => {
    expect(checkResolvedAddress("104.16.132.229").ok).toBe(true);
    expect(checkResolvedAddress("203.0.114.1").ok).toBe(true);
  });

  it("rejects local/special IPv6 and IPv4-mapped private addresses", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fd12:3456::1",
      "fc00::1",
      "ff02::1",
      "::ffff:192.168.0.10",
    ]) {
      expect(checkResolvedAddress(ip).ok, ip).toBe(false);
    }
    expect(checkResolvedAddress("2606:4700::6810:84e5").ok).toBe(true);
    expect(checkResolvedAddress("::ffff:104.16.132.229").ok).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(checkResolvedAddress("999.1.1.1").ok).toBe(false);
    expect(checkResolvedAddress("not-an-ip").ok).toBe(false);
  });
});
