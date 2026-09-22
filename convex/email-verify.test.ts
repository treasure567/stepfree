import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { hashVerificationCode } from "./lib/crypto";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

const CODE = "482913";
const KEY = "verify-key-0001";
const EMAIL = "Maya@Example.com";
const NORMALIZED = "maya@example.com";

async function seedUserWithSentCode(
  t: ReturnType<typeof convexTest>,
  overrides: { attempts?: number; expiresAt?: number; codeHash?: string } = {},
) {
  const codeHash = overrides.codeHash ?? (await hashVerificationCode(KEY, CODE));
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      username: "maya",
      displayName: "Maya",
      mobilityMode: "wheelchair",
      needsStepFreeToTrain: true,
      avoidsStairs: true,
      prefersFewerChanges: false,
      maxWalkingMinutes: 12,
      pendingEmail: EMAIL,
      createdAt: now,
      updatedAt: now,
    });
    const requestId = await ctx.db.insert("emailVerifications", {
      userId,
      email: EMAIL,
      emailNormalized: NORMALIZED,
      codeHash,
      status: "sent",
      attempts: overrides.attempts ?? 0,
      expiresAt: overrides.expiresAt ?? now + 10 * 60 * 1_000,
      idempotencyKey: KEY,
      createdAt: now,
      sentAt: now,
    });
    return { userId, requestId };
  });
}

describe("email verification: verify", () => {
  test("the correct code verifies the address and clears the pending email", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId } = await seedUserWithSentCode(t);

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: CODE });

    expect(result).toEqual({ success: true, email: EMAIL });
    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.email).toBe(EMAIL);
      expect(user?.emailNormalized).toBe(NORMALIZED);
      expect(user?.emailVerifiedAt).toBeTypeOf("number");
      expect(user?.pendingEmail).toBeUndefined();
    });
  });

  test("a wrong code is rejected and counts an attempt without locking", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId, requestId } = await seedUserWithSentCode(t);

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: "000000" });

    expect(result).toEqual({ success: false, error: "CODE_INVALID" });
    await t.run(async (ctx) => {
      const request = await ctx.db.get(requestId);
      expect(request?.attempts).toBe(1);
      expect(request?.status).toBe("sent");
    });
  });

  test("the fifth wrong attempt locks the code", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId, requestId } = await seedUserWithSentCode(t, { attempts: 4 });

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: "000000" });

    expect(result).toEqual({ success: false, error: "CODE_LOCKED" });
    await t.run(async (ctx) => {
      const request = await ctx.db.get(requestId);
      expect(request?.status).toBe("failed");
      expect(request?.failureCode).toBe("attempts-exhausted");
    });
  });

  test("a locked request refuses even the correct code", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId } = await seedUserWithSentCode(t, { attempts: 5 });

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: CODE });

    expect(result).toEqual({ success: false, error: "CODE_LOCKED" });
  });

  test("an expired code is rejected and the request is marked failed", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId, requestId } = await seedUserWithSentCode(t, {
      expiresAt: Date.now() - 1_000,
    });

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: CODE });

    expect(result).toEqual({ success: false, error: "CODE_EXPIRED" });
    await t.run(async (ctx) => {
      const request = await ctx.db.get(requestId);
      expect(request?.status).toBe("failed");
      expect(request?.failureCode).toBe("expired");
    });
  });

  test("verifying with no sent request returns request-not-found", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const userId = await t.run(async (ctx) => {
      const now = Date.now();
      return ctx.db.insert("users", {
        username: "sol",
        displayName: "Sol",
        mobilityMode: "mobility-aid",
        needsStepFreeToTrain: false,
        avoidsStairs: true,
        prefersFewerChanges: true,
        maxWalkingMinutes: 8,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.emailVerification.verify, { email: EMAIL, code: CODE });

    expect(result).toEqual({ success: false, error: "REQUEST_NOT_FOUND" });
  });

  test("verify requires authentication", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedUserWithSentCode(t);
    await expect(
      t.mutation(api.emailVerification.verify, { email: EMAIL, code: CODE }),
    ).rejects.toThrow();
  });

  test("a code claimed by another user's verified address is refused", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { userId } = await seedUserWithSentCode(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        username: "owner",
        displayName: "Owner",
        email: EMAIL,
        emailNormalized: NORMALIZED,
        emailVerifiedAt: now,
        mobilityMode: "limited-walking",
        needsStepFreeToTrain: false,
        avoidsStairs: false,
        prefersFewerChanges: false,
        maxWalkingMinutes: 20,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t
        .withIdentity({ subject: userId })
        .mutation(api.emailVerification.verify, { email: EMAIL, code: CODE }),
    ).rejects.toThrow();
  });
});
