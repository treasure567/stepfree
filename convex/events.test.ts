import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { publishEvent } from "./events";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("event bus", () => {
  test("publish is idempotent on dedupeKey", async () => {
    const t = convexTest(schema, modules);
    const first = await t.run(async (ctx) =>
      publishEvent(ctx, {
        type: "route.changed",
        dedupeKey: "route:waterloo-barbican:v2",
        data: { note: "first" },
      }),
    );
    const second = await t.run(async (ctx) =>
      publishEvent(ctx, {
        type: "route.changed",
        dedupeKey: "route:waterloo-barbican:v2",
        data: { note: "second" },
      }),
    );
    expect(first.published).toBe(true);
    expect(second.published).toBe(false);
    expect(second.eventId).toBe(first.eventId);

    const rows = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({ note: "first" });
  });

  test("dispatch marks a pending event dispatched", async () => {
    const t = convexTest(schema, modules);
    const eventId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        type: "route.changed",
        dedupeKey: "d1",
        data: {},
        status: "pending",
        attempts: 0,
        createdAt: Date.now(),
      }),
    );
    await t.mutation(internal.events.dispatch, { eventId });
    const event = await t.run(async (ctx) => ctx.db.get(eventId));
    expect(event?.status).toBe("dispatched");
    expect(event?.dispatchedAt).toBeTypeOf("number");
  });
});
