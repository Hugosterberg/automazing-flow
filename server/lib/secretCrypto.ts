/**
 * AES-256-GCM encryption for per-tenant integration secrets.
 *
 * The master key comes from SECRETS_ENCRYPTION_KEY (32 bytes, supplied as
 * base64 or hex, or any longer passphrase that we hash down to 32 bytes). The
 * database only ever stores ciphertext + iv + auth tag — never plaintext — so a
 * leak of the DB or the Supabase service role alone does not expose secrets.
 *
 * Factory-based so the resolved key is captured once and callers don't have to
 * re-read/validate the env var on every call. Tests can pass an explicit key.
 */

import crypto from "crypto";

export interface EncryptedSecret {
  /** base64 ciphertext */
  ciphertext: string;
  /** base64 12-byte GCM IV */
  iv: string;
  /** base64 16-byte GCM auth tag */
  tag: string;
}

export interface SecretCrypto {
  encrypt(plaintext: string): EncryptedSecret;
  decrypt(payload: EncryptedSecret): string;
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Accepts the raw env value and derives a 32-byte key:
 *   - exact 32 bytes from base64 or hex → used as-is
 *   - anything else (passphrase, wrong length) → SHA-256 hashed to 32 bytes
 * This keeps setup forgiving (any sufficiently random string works) while still
 * preferring a real 32-byte key when one is provided.
 */
export function deriveKey(rawKey: string): Buffer {
  const raw = String(rawKey || "").trim();
  if (!raw) {
    throw new Error("SECRETS_ENCRYPTION_KEY is empty");
  }

  const tryDecode = (encoding: "base64" | "hex"): Buffer | null => {
    try {
      const buf = Buffer.from(raw, encoding);
      return buf.length === KEY_BYTES ? buf : null;
    } catch {
      return null;
    }
  };

  return tryDecode("base64") || tryDecode("hex") || crypto.createHash("sha256").update(raw).digest();
}

export function createSecretCrypto(rawKey: string): SecretCrypto {
  const key = deriveKey(rawKey);

  function encrypt(plaintext: string): EncryptedSecret {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  function decrypt(payload: EncryptedSecret): string {
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  }

  return { encrypt, decrypt };
}

/** True when SECRETS_ENCRYPTION_KEY is set, so callers can degrade gracefully. */
export function hasSecretsEncryptionKey(): boolean {
  return String(process.env.SECRETS_ENCRYPTION_KEY || "").trim().length > 0;
}
