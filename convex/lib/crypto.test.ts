import { describe, expect, test } from "vitest";
import { createNumericCode, hashVerificationCode, sha256 } from "./crypto";

describe("hashVerificationCode", () => {
  test("is deterministic for the same inputs and pepper", async () => {
    process.env.OTP_PEPPER = "test-pepper";
    const first = await hashVerificationCode("idem-key-abcdef", "123456");
    const second = await hashVerificationCode("idem-key-abcdef", "123456");
    expect(first).toBe(second);
  });

  test("a secret pepper changes the hash (offline-guess resistance)", async () => {
    process.env.OTP_PEPPER = "";
    const withoutPepper = await hashVerificationCode("idem-key-abcdef", "123456");
    process.env.OTP_PEPPER = "a-secret-server-side-pepper";
    const withPepper = await hashVerificationCode("idem-key-abcdef", "123456");
    expect(withPepper).not.toBe(withoutPepper);
  });

  test("different codes produce different hashes", async () => {
    process.env.OTP_PEPPER = "p";
    const a = await hashVerificationCode("k", "000000");
    const b = await hashVerificationCode("k", "000001");
    expect(a).not.toBe(b);
  });

  test("produces a 64-character hex digest", async () => {
    const digest = await sha256("anything");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("createNumericCode", () => {
  test("always returns a zero-padded six digit code", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(createNumericCode()).toMatch(/^\d{6}$/);
    }
  });
});
