/**
 * Fetch guards per 詳細設計仕様書 §4.3 / §10.1 (SSRF):
 * pure decision functions — the actual HTTP client applies them before,
 * during and after a download. No I/O here.
 */

export const MAX_REDIRECTS = 3;

/** Default per-file download ceiling (bytes) — overridable per source. */
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpLiteral(hostname: string): boolean {
  // URL() brackets IPv6 hosts; strip for the check
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  if (IPV4_RE.test(hostname)) return true;
  return false;
}

/**
 * May we fetch this URL at all?
 * - parseable, https-only, default port
 * - hostname matches the allowlist (exact or subdomain of an entry)
 * - IP literals rejected (SSRF: no private-range or DNS-bypass fetches)
 * - embedded credentials rejected
 */
export function checkSourceUrl(
  rawUrl: string,
  allowedHosts: readonly string[],
): GuardVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "unparseable_url" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "https_required" };
  }
  if (url.port !== "" && url.port !== "443") {
    return { ok: false, reason: "non_default_port" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_in_url" };
  }
  const hostname = url.hostname.toLowerCase();
  if (isIpLiteral(hostname)) {
    return { ok: false, reason: "ip_literal_rejected" };
  }
  const allowed = allowedHosts.some((entry) => {
    const host = entry.trim().toLowerCase();
    if (host.length === 0) return false;
    return hostname === host || hostname.endsWith(`.${host}`);
  });
  if (!allowed) {
    return { ok: false, reason: "host_not_allowlisted" };
  }
  return { ok: true };
}

/** Pre-download check on the declared Content-Length (null = absent header). */
export function checkDeclaredLength(
  declaredLength: number | null,
  maxBytes: number = DEFAULT_MAX_BYTES,
): GuardVerdict {
  if (declaredLength === null) return { ok: true };
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    return { ok: false, reason: "invalid_content_length" };
  }
  if (declaredLength > maxBytes) {
    return { ok: false, reason: "declared_length_exceeds_limit" };
  }
  return { ok: true };
}

/**
 * Post-download check: the actual body must respect the limit AND the declared
 * length (both directions — a mismatch means truncation or smuggling, §4.3
 * "Content-Lengthと実体の双方を検査").
 */
export function checkActualLength(
  actualBytes: number,
  declaredLength: number | null,
  maxBytes: number = DEFAULT_MAX_BYTES,
): GuardVerdict {
  if (!Number.isSafeInteger(actualBytes) || actualBytes < 0) {
    return { ok: false, reason: "invalid_actual_length" };
  }
  if (actualBytes > maxBytes) {
    return { ok: false, reason: "body_exceeds_limit" };
  }
  if (declaredLength !== null && actualBytes !== declaredLength) {
    return { ok: false, reason: "length_mismatch" };
  }
  return { ok: true };
}

/**
 * Magic-number vs Content-Type consistency (§4.3). Returns ok for types we
 * cannot fingerprint (text/HTML/JSON) — the parser revalidates structure.
 */
export function checkMagicNumber(bytes: Uint8Array, contentType: string): GuardVerdict {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (type === "application/pdf") {
    // full "%PDF-" header, not just the prefix
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])
      ? { ok: true }
      : { ok: false, reason: "magic_mismatch_pdf" };
  }
  if (type === "application/zip") {
    // four-byte ZIP signatures: standard, empty archive, spanned archive
    const zipSignatures = [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08],
    ];
    return zipSignatures.some(startsWith)
      ? { ok: true }
      : { ok: false, reason: "magic_mismatch_zip" };
  }
  if (type === "application/gzip" || type === "application/x-gzip") {
    return startsWith([0x1f, 0x8b])
      ? { ok: true }
      : { ok: false, reason: "magic_mismatch_gzip" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// resolved-address guard (§10.1 SSRF / DNS再解決対策)
// ---------------------------------------------------------------------------

/**
 * Post-DNS check: the HTTP client must resolve every A/AAAA record for the
 * (already allowlisted) hostname, pass each address through this guard, and
 * connect only to addresses that pass — re-resolving per request so DNS
 * rebinding cannot swap in a private target between check and connect.
 * Rejects loopback, private, link-local, CGN, multicast and reserved ranges.
 */
export function checkResolvedAddress(ip: string): GuardVerdict {
  const bad = (reason: string): GuardVerdict => ({ ok: false, reason });
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,4})$/.exec(ip);
  if (v4) {
    const octets = v4.slice(1).map((part) => Number.parseInt(part, 10));
    if (octets.some((octet) => octet > 255)) return bad("invalid_ip");
    const [a = 0, b = 0] = octets;
    if (a === 0 || a === 10 || a === 127) return bad("private_or_loopback_ipv4");
    if (a === 100 && b >= 64 && b <= 127) return bad("cgn_range_ipv4");
    if (a === 169 && b === 254) return bad("link_local_ipv4");
    if (a === 172 && b >= 16 && b <= 31) return bad("private_or_loopback_ipv4");
    if (a === 192 && b === 168) return bad("private_or_loopback_ipv4");
    if (a >= 224) return bad("multicast_or_reserved_ipv4");
    return { ok: true };
  }

  const v6 = ip.toLowerCase();
  if (!v6.includes(":")) return bad("invalid_ip");
  if (v6 === "::" || v6 === "::1") return bad("loopback_or_unspecified_ipv6");
  if (v6.startsWith("::ffff:")) {
    // IPv4-mapped — apply the IPv4 rules to the embedded address
    return checkResolvedAddress(v6.slice("::ffff:".length));
  }
  if (
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb")
  ) {
    return bad("link_local_ipv6");
  }
  if (v6.startsWith("fc") || v6.startsWith("fd")) return bad("unique_local_ipv6");
  if (v6.startsWith("ff")) return bad("multicast_ipv6");
  return { ok: true };
}
