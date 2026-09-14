import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../../lib/crypto";

describe("encrypt/decrypt", () => {
  it("round-trips a real-shaped Plaid access token exactly", () => {
    const original = "access-sandbox-11111111-2222-3333-4444-555555555555";
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it("never stores the plaintext inside the encrypted payload", () => {
    const original = "access-sandbox-plaintext-should-not-appear";
    const encrypted = encrypt(original);
    expect(encrypted).not.toContain(original);
  });

  it("produces a different ciphertext each time (random IV), even for the same plaintext", () => {
    const original = "access-sandbox-same-input-twice";
    const first = encrypt(original);
    const second = encrypt(original);
    expect(first).not.toBe(second);
    // Both still decrypt back to the same original — the randomness is
    // just the IV, not a correctness issue.
    expect(decrypt(first)).toBe(original);
    expect(decrypt(second)).toBe(original);
  });

  it("rejects a malformed payload instead of silently returning garbage", () => {
    expect(() => decrypt("not-a-real-payload")).toThrow();
  });

  it("rejects a tampered ciphertext (GCM auth tag catches it)", () => {
    const encrypted = encrypt("access-sandbox-original-value");
    const [iv, tag, ciphertext] = encrypted.split(".");
    // Flip the ciphertext without touching the auth tag — GCM must reject this.
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [iv, tag, tamperedCiphertext.toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });
});
