import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedAlert(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db.insert("alerts", {
      channel: "watch",
      email: "maya@example.com",
      emailNormalized: "maya@example.com",
      reason: "rerouted",
      fromSlug: "waterloo",
      toSlug: "barbican",
      fromName: "Waterloo",
      toName: "Barbican",
      idempotencyKey: "alert-1",
      status: "sent",
      providerMessageId: "msg_abc",
      attempts: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("agentmail delivery webhook", () => {
  test("advances the alert state machine to delivered", async () => {
    const t = convexTest(schema, modules);
    const alertId = await seedAlert(t);
    const result = await t.mutation(internal.webhooks.ingestAgentmailDelivery, {
      eventId: "evt_d1",
      providerMessageId: "msg_abc",
      outcome: "delivered",
    });
    expect(result.applied).toBe(true);
    const alert = await t.run(async (ctx) => ctx.db.get(alertId));
    expect(alert?.status).toBe("delivered");
    expect(alert?.deliveredAt).toBeTypeOf("number");
  });

  test("is idempotent on the provider event id", async () => {
    const t = convexTest(schema, modules);
    await seedAlert(t);
    await t.mutation(internal.webhooks.ingestAgentmailDelivery, {
      eventId: "evt_d1",
      providerMessageId: "msg_abc",
      outcome: "delivered",
    });
    const duplicate = await t.mutation(
      internal.webhooks.ingestAgentmailDelivery,
      { eventId: "evt_d1", providerMessageId: "msg_abc", outcome: "delivered" },
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.applied).toBe(false);
  });
});

describe("partner lift-status webhook", () => {
  test("records an advisory report against the station", async () => {
    const t = convexTest(schema, modules);
    const stationId = await t.run(async (ctx) =>
      ctx.db.insert("stations", {
        slug: "bond-street",
        name: "Bond Street",
        city: "London",
        latitude: 51.5142,
        longitude: -0.1494,
        lines: ["Jubilee"],
        stepFreeAccess: "street-to-train",
        sourceName: "TfL",
        sourceUrl: "https://tfl.gov.uk",
        lastVerifiedAt: Date.now(),
      }),
    );
    const result = await t.mutation(
      internal.webhooks.ingestPartnerLiftStatus,
      {
        eventId: "evt_p1",
        stationSlug: "bond-street",
        status: "out-of-service",
        note: "lift down",
      },
    );
    expect(result.recorded).toBe(true);
    const reports = await t.run(async (ctx) =>
      ctx.db
        .query("reports")
        .withIndex("by_station", (q) => q.eq("stationId", stationId))
        .collect(),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].observation).toBe("not-working");
  });
});

describe("agentmail inbound webhook", () => {
  test("parses intent, normalizes the sender, and stores the message", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.webhooks.ingestAgentmailInbound, {
      eventId: "evt_i1",
      providerMessageId: "m1",
      fromEmail: "Maya@Example.com",
      subject: "update",
      text: "I made it, all good!",
    });
    expect(result.intent).toBe("arrived");
    expect(result.matchedWatch).toBe(false);
    const inbound = await t.run(async (ctx) =>
      ctx.db.query("inboundMessages").collect(),
    );
    expect(inbound).toHaveLength(1);
    expect(inbound[0].fromNormalized).toBe("maya@example.com");
  });
});
