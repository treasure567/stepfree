import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedIds(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const emergencyId = await ctx.db.insert("emergencies", {
      sessionId: "s-x-0000-1111-2222",
      kind: "stuck-no-lift",
      status: "raised",
      idempotencyKey: "k",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const eventId = await ctx.db.insert("events", {
      type: "route.changed",
      dedupeKey: "d",
      data: {},
      status: "failed",
      attempts: 1,
      createdAt: Date.now(),
    });
    return { emergencyId, eventId };
  });
}

describe("server-side authorization boundary", () => {
  test("ops metrics and operator actions reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { eventId } = await seedIds(t);
    await expect(t.query(api.ops.metrics, {})).rejects.toThrow();
    await expect(t.mutation(api.ops.retryEvent, { eventId })).rejects.toThrow();
    await expect(t.mutation(api.ops.retryFailedEvents, {})).rejects.toThrow();
    await expect(t.mutation(api.ops.runEvidenceNow, {})).rejects.toThrow();
    await expect(t.mutation(api.ops.syncTflNow, {})).rejects.toThrow();
  });

  test("emergency ops views and actions reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { emergencyId } = await seedIds(t);
    await expect(t.query(api.emergency.active, {})).rejects.toThrow();
    await expect(t.query(api.emergency.stats, {})).rejects.toThrow();
    await expect(t.query(api.emergency.assignedToMe, {})).rejects.toThrow();
    await expect(
      t.query(api.emergency.timeline, { emergencyId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.emergency.acknowledge, { emergencyId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.emergency.resolve, { emergencyId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.emergency.assign, { emergencyId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.emergency.reopen, { emergencyId }),
    ).rejects.toThrow();
  });

  test("webhook audit views reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await expect(t.query(api.webhooks.receipts, {})).rejects.toThrow();
    await expect(t.query(api.webhooks.recentInbound, {})).rejects.toThrow();
    await expect(
      t.query(api.webhooks.receiptsForSource, { source: "partner-lift" }),
    ).rejects.toThrow();
  });

  test("a session owner can still read their own emergencies without auth", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedIds(t);
    const list = await t.query(api.emergency.forSession, {
      sessionId: "s-x-0000-1111-2222",
    });
    expect(list.length).toBe(1);
  });
});
