import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { createSecretCrypto, deriveKey } from "../../server/lib/secretCrypto.ts";

const base64Key = crypto.randomBytes(32).toString("base64");

describe("secretCrypto", () => {
  it("round-trips a value through encrypt/decrypt", () => {
    const sc = createSecretCrypto(base64Key);
    const secret = "sk_live_abc123_ÅÄÖ_😀";
    const enc = sc.encrypt(secret);
    expect(enc.ciphertext).not.toContain(secret);
    expect(sc.decrypt(enc)).toBe(secret);
  });

  it("uses a fresh IV per encryption (ciphertext differs for same input)", () => {
    const sc = createSecretCrypto(base64Key);
    const a = sc.encrypt("same-value");
    const b = sc.encrypt("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(sc.decrypt(a)).toBe("same-value");
    expect(sc.decrypt(b)).toBe("same-value");
  });

  it("fails to decrypt when the auth tag is tampered with", () => {
    const sc = createSecretCrypto(base64Key);
    const enc = sc.encrypt("secret");
    const tampered = { ...enc, tag: Buffer.from(crypto.randomBytes(16)).toString("base64") };
    expect(() => sc.decrypt(tampered)).toThrow();
  });

  it("cannot decrypt with a different key", () => {
    const a = createSecretCrypto(crypto.randomBytes(32).toString("base64"));
    const b = createSecretCrypto(crypto.randomBytes(32).toString("base64"));
    const enc = a.encrypt("secret");
    expect(() => b.decrypt(enc)).toThrow();
  });

  it("derives a 32-byte key from a passphrase of any length", () => {
    expect(deriveKey("short-passphrase").length).toBe(32);
    expect(deriveKey(crypto.randomBytes(32).toString("hex")).length).toBe(32);
    expect(() => deriveKey("")).toThrow();
  });
});
