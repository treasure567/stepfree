import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";
import { seedNetwork, blockingDemoIncident } from "../test/seed";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const SESSION = "s-alerts-0000-1111-2222-3333";

async function seedQueuedAlert(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("alerts", {
      channel: "drill",
      sessionId: SESSION,
      email: "m@e.com",
      emailNormalized: "m@e.com",
      reason: "rerouted",
      fromSlug: "waterloo",
      toSlug: "barbican",
      fromName: "Waterloo",
      toName: "Barbican",
      idempotencyKey: `k-${Math.random()}`,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("alerts: request + idempotency", () => {
  test("a reroute queues one alert; repeats are idempotent", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      await blockingDemoIncident(ctx, SESSION, ids.get("bond-street")!);
    });
    const first = await t.mutation(api.alerts.requestDrillAlert, {
      sessionId: SESSION,
      email: "maya@example.com",
      fromSlug: "waterloo",
      toSlug: "barbican",
    });
    expect(first.created).toBe(true);
    expect(first.status).toBe("queued");
    const second = await t.mutation(api.alerts.requestDrillAlert, {
      sessionId: SESSION,
      email: "maya@example.com",
      fromSlug: "waterloo",
      toSlug: "barbican",
    });
    expect(second.created).toBe(false);
    const list = await t.query(api.alerts.drillAlerts, { sessionId: SESSION });
    expect(list.length).toBe(1);
  });

  test("an alert with no active reroute is refused", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
    });
    await expect(
      t.mutation(api.alerts.requestDrillAlert, {
        sessionId: SESSION,
        email: "maya@example.com",
        fromSlug: "waterloo",
        toSlug: "barbican",
      }),
    ).rejects.toThrow();
  });
});

describe("alerts: delivery state machine", () => {
  test("queued → sending → sent, and a second claim is refused", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const id = await seedQueuedAlert(t);
    const claim = await t.mutation(internal.alerts.markSending, { alertId: id });
    expect(claim.claimed).toBe(true);
    const again = await t.mutation(internal.alerts.markSending, { alertId: id });
    expect(again.claimed).toBe(false);
    await t.mutation(internal.alerts.markSent, {
      alertId: id,
      providerMessageId: "msg_1",
    });
    const sent = await t.run(async (ctx) => ctx.db.get(id));
    expect(sent?.status).toBe("sent");
    expect(sent?.providerMessageId).toBe("msg_1");
  });

  test("a failed alert can be requeued", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const id = await seedQueuedAlert(t);
    await t.mutation(internal.alerts.markSending, { alertId: id });
    await t.mutation(internal.alerts.markFailed, { alertId: id, error: "403" });
    expect((await t.run(async (ctx) => ctx.db.get(id)))?.status).toBe("failed");
    await t.mutation(internal.alerts.requeue, { alertId: id });
    expect((await t.run(async (ctx) => ctx.db.get(id)))?.status).toBe("queued");
  });
});

describe("alerts: ops queries need auth", () => {
  test("byStatus and opsStats reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await expect(
      t.query(api.alerts.byStatus, { status: "failed" }),
    ).rejects.toThrow();
    await expect(t.query(api.alerts.opsStats, {})).rejects.toThrow();
  });
});
