import { describe, expect, test } from "vitest";
import {
  hmacSha256Hex,
  normalizeSignature,
  timingSafeEqualHex,
  verifyHmacSignature,
} from "./webhookAuth";

describe("webhookAuth", () => {
  test("hmac is deterministic and lowercase hex", async () => {
    const a = await hmacSha256Hex("secret", "payload");
    const b = await hmacSha256Hex("secret", "payload");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("verifies a correct signature, with or without scheme prefix", async () => {
    const payload = JSON.stringify({ hello: "world" });
    const signature = await hmacSha256Hex("shh", payload);
    expect(
      await verifyHmacSignature({ secret: "shh", payload, signature }),
    ).toBe(true);
    expect(
      await verifyHmacSignature({
        secret: "shh",
        payload,
        signature: `sha256=${signature.toUpperCase()}`,
      }),
    ).toBe(true);
  });

  test("rejects tampered payload, wrong secret, and missing inputs", async () => {
    const payload = "the original body";
    const signature = await hmacSha256Hex("shh", payload);
    expect(
      await verifyHmacSignature({
        secret: "shh",
        payload: "a different body",
        signature,
      }),
    ).toBe(false);
    expect(
      await verifyHmacSignature({ secret: "wrong", payload, signature }),
    ).toBe(false);
    expect(
      await verifyHmacSignature({ secret: "shh", payload, signature: null }),
    ).toBe(false);
    expect(
      await verifyHmacSignature({ secret: "", payload, signature }),
    ).toBe(false);
  });

  test("timing-safe compare handles equal, unequal, and length mismatch", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abcde")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(false);
  });

  test("normalizeSignature strips scheme and lowercases", () => {
    expect(normalizeSignature("sha256=ABCD")).toBe("abcd");
    expect(normalizeSignature("  ABCD  ")).toBe("abcd");
    expect(normalizeSignature("v1=deadBEEF")).toBe("deadbeef");
  });
});
