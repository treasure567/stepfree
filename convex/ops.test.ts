import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

function alertDoc(updatedAt: number, key: string) {
  return {
    channel: "watch" as const,
    email: "m@e.com",
    emailNormalized: "m@e.com",
    reason: "rerouted" as const,
    fromSlug: "waterloo",
    toSlug: "barbican",
    fromName: "Waterloo",
    toName: "Barbican",
    idempotencyKey: key,
    status: "sending" as const,
    attempts: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("reconcileStuckAlerts", () => {
  test("requeues alerts stuck in 'sending' past the cutoff, leaves fresh ones", async () => {
    const t = convexTest(schema, modules);
    const stale = Date.now() - 1000 * 60 * 10;
    const stuckId = await t.run(async (ctx) =>
      ctx.db.insert("alerts", alertDoc(stale, "stuck")),
    );
    const freshId = await t.run(async (ctx) =>
      ctx.db.insert("alerts", alertDoc(Date.now(), "fresh")),
    );

    const res = await t.mutation(internal.ops.reconcileStuckAlerts, {});
    expect(res.requeued).toBe(1);

    const stuck = await t.run(async (ctx) => ctx.db.get(stuckId));
    const fresh = await t.run(async (ctx) => ctx.db.get(freshId));
    expect(stuck?.status).toBe("queued");
    expect(fresh?.status).toBe("sending");
  });

  test("cleanupExpired removes only expired idempotency keys", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("idempotencyKeys", {
        scope: "s",
        key: "old",
        createdAt: now - 1000,
        expiresAt: now - 1,
      });
      await ctx.db.insert("idempotencyKeys", {
        scope: "s",
        key: "live",
        createdAt: now,
        expiresAt: now + 100000,
      });
    });
    const res = await t.mutation(internal.ops.cleanupExpired, {});
    expect(res.deleted).toBe(1);
    const remaining = await t.run(async (ctx) =>
      ctx.db.query("idempotencyKeys").collect(),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe("live");
  });
});
