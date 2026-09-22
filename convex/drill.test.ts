import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const SESSION = "s-drilltest-0000-1111-2222";

const stationSeeds: Array<[string, string, number, number]> = [
  ["waterloo", "Waterloo", 51.5033, -0.1147],
  ["westminster", "Westminster", 51.501, -0.1254],
  ["green-park", "Green Park", 51.5067, -0.1428],
  ["bond-street", "Bond Street", 51.5142, -0.1494],
  ["farringdon", "Farringdon", 51.52, -0.1053],
  ["barbican", "Barbican", 51.5204, -0.0979],
  ["london-bridge", "London Bridge", 51.5055, -0.0865],
  ["liverpool-street", "Liverpool Street", 51.5178, -0.0823],
  ["victoria", "Victoria", 51.4965, -0.1447],
];
const connectionSeeds: Array<[string, string, string, number, number]> = [
  ["waterloo", "westminster", "Jubilee", 4, 1],
  ["westminster", "green-park", "Jubilee", 3, 1],
  ["green-park", "bond-street", "Jubilee", 3, 1],
  ["bond-street", "farringdon", "Elizabeth", 5, 1],
  ["farringdon", "barbican", "Metropolitan", 3, 1],
  ["waterloo", "london-bridge", "Jubilee", 6, 1],
  ["london-bridge", "farringdon", "Thameslink", 15, 2],
  ["barbican", "liverpool-street", "Metropolitan", 4, 1],
  ["green-park", "victoria", "Victoria", 3, 1],
];

async function seedNetwork(ctx: MutationCtx) {
  const now = Date.now();
  const ids = new Map<string, Id<"stations">>();
  for (const [slug, name, latitude, longitude] of stationSeeds) {
    const id = await ctx.db.insert("stations", {
      slug,
      name,
      city: "London",
      latitude,
      longitude,
      lines: ["Test"],
      stepFreeAccess: "street-to-train",
      sourceName: "test",
      sourceUrl: "https://example.com",
      lastVerifiedAt: now,
    });
    ids.set(slug, id);
  }
  for (const [from, to, line, d, a] of connectionSeeds) {
    await ctx.db.insert("connections", {
      fromStationId: ids.get(from)!,
      toStationId: ids.get(to)!,
      line,
      durationMinutes: d,
      accessibilityMinutes: a,
    });
  }
  return ids;
}

describe("drill: outage lifecycle", () => {
  test("simulate → reroute → resolve → restore", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
    });
    await t.mutation(api.drill.simulateOutage, {
      sessionId: SESSION,
      stationSlug: "bond-street",
    });
    const rerouted = await t.query(api.routes.plan, {
      fromSlug: "waterloo",
      toSlug: "barbican",
      sessionId: SESSION,
    });
    expect(rerouted.status).toBe("ready");
    if (rerouted.status === "ready") {
      expect(rerouted.rerouted).toBe(true);
      expect(rerouted.durationMinutes).toBe(36);
    }
    await t.mutation(api.drill.resolveOutage, { sessionId: SESSION });
    const restored = await t.query(api.routes.plan, {
      fromSlug: "waterloo",
      toSlug: "barbican",
      sessionId: SESSION,
    });
    if (restored.status === "ready") {
      expect(restored.rerouted).toBe(false);
      expect(restored.durationMinutes).toBe(31);
    }
  });

  test("a forged excerpt is refused", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const result = await t.mutation(api.drill.attemptForgedIncident, {
      sessionId: SESSION,
    });
    expect(result.rejected).toBe(true);
  });
});

describe("drill: attack battery", () => {
  test("every guard holds and the scope is cleaned up", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
    });
    const outcome = await t.mutation(api.drill.runAttacks, { sessionId: SESSION });
    expect(outcome.total).toBe(6);
    expect(outcome.held).toBe(6);

    const leftover = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("webhookReceipts").collect(),
      reports: await ctx.db.query("reports").collect(),
      keys: await ctx.db.query("idempotencyKeys").collect(),
    }));
    expect(leftover.receipts).toHaveLength(0);
    expect(leftover.reports).toHaveLength(0);
    expect(leftover.keys).toHaveLength(0);
  });
});

describe("drill: reroute receipt", () => {
  test("mintReceipt captures the reroute and getReceipt returns it", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
    });
    await t.mutation(api.drill.simulateOutage, {
      sessionId: SESSION,
      stationSlug: "bond-street",
    });
    const { code } = await t.mutation(api.drill.mintReceipt, {
      sessionId: SESSION,
      fromSlug: "waterloo",
      toSlug: "barbican",
    });
    const receipt = await t.query(api.drill.getReceipt, { code });
    expect(receipt).not.toBeNull();
    expect(receipt?.baselineMinutes).toBe(31);
    expect(receipt?.reroutedMinutes).toBe(36);
    expect(receipt?.delayMinutes).toBe(5);
    expect(receipt?.rerouted).toBe(true);
    expect(receipt?.via).toBe("London Bridge");
  });

  test("getReceipt returns null for an unknown code", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    expect(await t.query(api.drill.getReceipt, { code: "nope" })).toBeNull();
  });
});

describe("drill: network status", () => {
  test("reports a session outage as lift-down and others operating", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
    });
    await t.mutation(api.drill.simulateOutage, {
      sessionId: SESSION,
      stationSlug: "bond-street",
    });
    const status = await t.query(api.drill.networkStatus, { sessionId: SESSION });
    const bond = status.find((s) => s.slug === "bond-street");
    const waterloo = status.find((s) => s.slug === "waterloo");
    expect(bond?.status).toBe("lift-down");
    expect(waterloo?.status).toBe("operating");
  });
});
