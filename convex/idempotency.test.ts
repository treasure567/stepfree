import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  claimIdempotencyKey,
  hasIdempotencyKey,
} from "./lib/idempotency";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("idempotency", () => {
  test("first claim succeeds, second is a no-op", async () => {
    const t = convexTest(schema, modules);
    const first = await t.run(async (ctx) =>
      claimIdempotencyKey(ctx, "webhook", "evt_1"),
    );
    const second = await t.run(async (ctx) =>
      claimIdempotencyKey(ctx, "webhook", "evt_1"),
    );
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  test("scopes are isolated", async () => {
    const t = convexTest(schema, modules);
    const a = await t.run(async (ctx) =>
      claimIdempotencyKey(ctx, "emergency", "k"),
    );
    const b = await t.run(async (ctx) =>
      claimIdempotencyKey(ctx, "webhook", "k"),
    );
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  test("hasIdempotencyKey reflects claims", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t.run(async (ctx) => hasIdempotencyKey(ctx, "s", "missing")),
    ).toBe(false);
    await t.run(async (ctx) => claimIdempotencyKey(ctx, "s", "present"));
    expect(
      await t.run(async (ctx) => hasIdempotencyKey(ctx, "s", "present")),
    ).toBe(true);
  });
});
