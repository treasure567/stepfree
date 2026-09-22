import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedEmergency(
  t: ReturnType<typeof convexTest>,
  sessionId: string,
  status: "raised" | "acknowledged" = "raised",
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("emergencies", {
      sessionId,
      kind: "stuck-no-lift",
      status,
      idempotencyKey: `${sessionId}:stuck-no-lift:1`,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

describe("emergency escalation state machine", () => {
  test("a raised emergency escalates and publishes an event", async () => {
    const t = convexTest(schema, modules);
    const emergencyId = await seedEmergency(t, "s1");

    expect(
      await t.query(internal.emergency.isAwaitingAcknowledgement, {
        emergencyId,
      }),
    ).toBe(true);

    await t.mutation(internal.emergency.markEscalated, { emergencyId });

    const escalated = await t.run(async (ctx) => ctx.db.get(emergencyId));
    expect(escalated?.status).toBe("escalated");
    expect(escalated?.escalatedAt).toBeTypeOf("number");
    expect(
      await t.query(internal.emergency.isAwaitingAcknowledgement, {
        emergencyId,
      }),
    ).toBe(false);

    const events = await t.run(async (ctx) => ctx.db.query("events").collect());
    expect(events.some((e) => e.type === "emergency.escalated")).toBe(true);
  });

  test("markEscalated is a no-op once acknowledged", async () => {
    const t = convexTest(schema, modules);
    const emergencyId = await seedEmergency(t, "s2", "acknowledged");
    await t.mutation(internal.emergency.markEscalated, { emergencyId });
    const row = await t.run(async (ctx) => ctx.db.get(emergencyId));
    expect(row?.status).toBe("acknowledged");
  });
});

describe("emergency ownership", () => {
  test("the session owner can cancel", async () => {
    const t = convexTest(schema, modules);
    const emergencyId = await seedEmergency(t, "owner");
    const result = await t.mutation(api.emergency.cancel, {
      emergencyId,
      sessionId: "owner",
    });
    expect(result.status).toBe("cancelled");
  });

  test("a different session cannot cancel", async () => {
    const t = convexTest(schema, modules);
    const emergencyId = await seedEmergency(t, "owner");
    await expect(
      t.mutation(api.emergency.cancel, {
        emergencyId,
        sessionId: "stranger",
      }),
    ).rejects.toThrow();
  });

  test("forSession returns the session's emergencies", async () => {
    const t = convexTest(schema, modules);
    await seedEmergency(t, "s3");
    const list = await t.query(api.emergency.forSession, { sessionId: "s3" });
    expect(list.length).toBe(1);
    expect(list[0].sessionId).toBe("s3");
  });

  test("acknowledge requires an authenticated operator", async () => {
    const t = convexTest(schema, modules);
    const emergencyId = await seedEmergency(t, "s4");
    await expect(
      t.mutation(api.emergency.acknowledge, { emergencyId }),
    ).rejects.toThrow();
  });
});
