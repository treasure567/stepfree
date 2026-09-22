import { describe, expect, test } from "vitest";
import {
  normalizeEmail,
  validateCoordinates,
  validateEmail,
  validateIdempotencyKey,
  validateSessionId,
} from "./validation";

describe("validateSessionId", () => {
  test("accepts an id within the length bounds", () => {
    expect(validateSessionId("session-abcdefghij")).toBe("session-abcdefghij");
  });

  test("rejects an id that is too short", () => {
    expect(() => validateSessionId("short")).toThrow();
  });

  test("rejects an id that is too long", () => {
    expect(() => validateSessionId("x".repeat(101))).toThrow();
  });
});

describe("validateEmail", () => {
  test("trims, lower-cases, and accepts a valid address", () => {
    expect(validateEmail("  Maya@Example.COM ")).toBe("maya@example.com");
  });

  test("rejects a malformed address", () => {
    expect(() => validateEmail("not-an-email")).toThrow();
  });

  test("normalizeEmail is idempotent", () => {
    expect(normalizeEmail(normalizeEmail("A@B.CO"))).toBe("a@b.co");
  });
});

describe("validateCoordinates", () => {
  test("accepts in-range coordinates", () => {
    expect(() => validateCoordinates(51.5, -0.1)).not.toThrow();
  });

  test("rejects out-of-range latitude", () => {
    expect(() => validateCoordinates(200, 0)).toThrow();
  });

  test("rejects non-finite values", () => {
    expect(() => validateCoordinates(Number.NaN, 0)).toThrow();
  });
});

describe("validateIdempotencyKey", () => {
  test("accepts a key within bounds", () => {
    expect(validateIdempotencyKey("idem-key-abcdefgh")).toBe("idem-key-abcdefgh");
  });

  test("rejects a key that is too short", () => {
    expect(() => validateIdempotencyKey("short")).toThrow();
  });
});
