/**
 * Envelope encryption for values stored in `app_settings` (§9.1/§10.2).
 * The KEK lives only in the SETTINGS_ENC_KEY secret (32 bytes, base64) —
 * never in the database — so a DB read/backup/snapshot alone no longer
 * yields the live Anthropic API key. AES-256-GCM via WebCrypto (Workers
 * and Node 24 both provide `crypto.subtle`).
 *
 * Stored format: `enc:v1:<iv base64>:<ciphertext base64>` — the prefix keeps
 * plaintext rows written before the KEK existed readable (migration is
 * lazy: the next save re-encrypts).
 */

const ENC_PREFIX = "enc:v1:";
const IV_BYTES = 12;

export function isEncryptedSetting(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Import the base64-encoded 32-byte KEK; throws on malformed input. */
export async function importSettingsKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key.trim());
  if (raw.length !== 32) {
    throw new Error("SETTINGS_ENC_KEY must be 32 bytes (base64-encoded)");
  }
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSetting(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

/** Throws on tampering/wrong key (GCM auth failure) or malformed input. */
export async function decryptSetting(key: CryptoKey, stored: string): Promise<string> {
  if (!isEncryptedSetting(stored)) {
    throw new Error("value is not in enc:v1 format");
  }
  const [ivPart, ciphertextPart, ...rest] = stored.slice(ENC_PREFIX.length).split(":");
  if (!ivPart || !ciphertextPart || rest.length > 0) {
    throw new Error("malformed enc:v1 value");
  }
  const iv = fromBase64(ivPart).buffer as ArrayBuffer;
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    fromBase64(ciphertextPart).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}
