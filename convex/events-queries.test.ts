import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedEvents(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("events", {
      type: "route.changed",
      dedupeKey: "e1",
      data: {},
      status: "dispatched",
      attempts: 0,
      createdAt: now - 3000,
    });
    await ctx.db.insert("events", {
      type: "emergency.raised",
      dedupeKey: "e2",
      data: {},
      status: "failed",
      attempts: 2,
      createdAt: now - 2000,
    });
    await ctx.db.insert("events", {
      type: "route.changed",
      dedupeKey: "e3",
      data: {},
      status: "pending",
      attempts: 0,
      createdAt: now - 1000,
    });
  });
}

describe("event bus queries", () => {
  test("recent returns newest first", async () => {
    const t = convexTest(schema, modules);
    await seedEvents(t);
    const recent = await t.query(api.events.recent, { limit: 10 });
    expect(recent.length).toBe(3);
    expect(recent[0].dedupeKey).toBe("e3");
  });

  test("byType filters to one event type", async () => {
    const t = convexTest(schema, modules);
    await seedEvents(t);
    const routeChanges = await t.query(api.events.byType, {
      type: "route.changed",
    });
    expect(routeChanges.length).toBe(2);
    expect(routeChanges.every((e) => e.type === "route.changed")).toBe(true);
  });

  test("failed returns only failed events", async () => {
    const t = convexTest(schema, modules);
    await seedEvents(t);
    const failed = await t.query(api.events.failed, {});
    expect(failed.length).toBe(1);
    expect(failed[0].type).toBe("emergency.raised");
  });

  test("pending returns only pending events in ascending order", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedEvents(t);
    const pending = await t.query(internal.events.pending, {});
    expect(pending.length).toBe(1);
    expect(pending[0].dedupeKey).toBe("e3");
  });
});
