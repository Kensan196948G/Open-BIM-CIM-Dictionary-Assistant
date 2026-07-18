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
    // %PDF
    return startsWith([0x25, 0x50, 0x44, 0x46])
      ? { ok: true }
      : { ok: false, reason: "magic_mismatch_pdf" };
  }
  if (type === "application/zip") {
    // PK
    return startsWith([0x50, 0x4b])
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
