import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { calculateTransitRoute } from "./lib/transit";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

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
    const stationId = await ctx.db.insert("stations", {
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
    ids.set(slug, stationId);
    await ctx.db.insert("lifts", {
      stationId,
      name: "lift",
      status: "working",
      sourceType: "official",
      lastCheckedAt: now,
    });
  }

  for (const [from, to, line, durationMinutes, accessibilityMinutes] of connectionSeeds) {
    await ctx.db.insert("connections", {
      fromStationId: ids.get(from)!,
      toStationId: ids.get(to)!,
      line,
      durationMinutes,
      accessibilityMinutes,
    });
  }

  return ids;
}

async function blockingDemoIncident(
  ctx: MutationCtx,
  sessionId: string,
  stationId: Id<"stations">,
) {
  const now = Date.now();
  return ctx.db.insert("demoIncidents", {
    sessionId,
    stationId,
    status: "active",
    severity: "route-blocking",
    kind: "lift-outage",
    title: "Primary lift unavailable",
    description: "drill",
    sourceName: "drill",
    confidence: 0.98,
    candidateKey: "bond-street-lift-outage",
    createdAt: now,
    updatedAt: now,
  });
}

describe("calculateTransitRoute", () => {
  test("baseline Waterloo to Barbican is 31 minutes via Bond Street", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican");
      expect(route.status).toBe("ready");
      if (route.status !== "ready") return;
      expect(route.durationMinutes).toBe(31);
      expect(route.rerouted).toBe(false);
      expect(route.stations.map((s) => s.slug)).toContain("bond-street");
    });
  });

  test("a session outage at Bond Street reroutes via London Bridge and adds 5 minutes", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      await blockingDemoIncident(ctx, "s-aaaaaaaaaaaaaaaa", ids.get("bond-street")!);
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican", {
        sessionId: "s-aaaaaaaaaaaaaaaa",
      });
      expect(route.status).toBe("ready");
      if (route.status !== "ready") return;
      expect(route.durationMinutes).toBe(36);
      expect(route.delayMinutes).toBe(5);
      expect(route.rerouted).toBe(true);
      expect(route.stations.map((s) => s.slug)).toContain("london-bridge");
    });
  });

  test("one session's outage does not affect another session's route", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      await blockingDemoIncident(ctx, "s-aaaaaaaaaaaaaaaa", ids.get("bond-street")!);
      const other = await calculateTransitRoute(ctx, "waterloo", "barbican", {
        sessionId: "s-bbbbbbbbbbbbbbbb",
      });
      expect(other.status).toBe("ready");
      if (other.status !== "ready") return;
      expect(other.durationMinutes).toBe(31);
      expect(other.rerouted).toBe(false);
    });
  });

  test("resolving the outage restores the original 31 minute route", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      const incidentId = await blockingDemoIncident(
        ctx,
        "s-aaaaaaaaaaaaaaaa",
        ids.get("bond-street")!,
      );
      await ctx.db.patch(incidentId, { status: "resolved" });
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican", {
        sessionId: "s-aaaaaaaaaaaaaaaa",
      });
      expect(route.status).toBe("ready");
      if (route.status !== "ready") return;
      expect(route.durationMinutes).toBe(31);
      expect(route.rerouted).toBe(false);
    });
  });

  test("an unreviewed real incident is advisory and does not block routing", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      const now = Date.now();
      await ctx.db.insert("incidents", {
        stationId: ids.get("bond-street")!,
        kind: "lift-outage",
        status: "active",
        severity: "route-blocking",
        title: "TfL disruption",
        description: "x",
        sourceType: "official",
        sourceName: "TfL feed",
        confidence: 1,
        reportedAt: now,
        updatedAt: now,
      });
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican");
      expect(route.status).toBe("ready");
      if (route.status !== "ready") return;
      expect(route.durationMinutes).toBe(31);
      expect(route.rerouted).toBe(false);
    });
  });

  test("a human-reviewed incident at Bond Street reroutes the traveller", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      const now = Date.now();
      await ctx.db.insert("incidents", {
        stationId: ids.get("bond-street")!,
        kind: "lift-outage",
        status: "active",
        severity: "route-blocking",
        title: "Reviewed outage",
        description: "x",
        sourceType: "official",
        sourceName: "StepFree review",
        confidence: 0.9,
        humanReviewed: true,
        reportedAt: now,
        updatedAt: now,
      });
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican");
      expect(route.status).toBe("ready");
      if (route.status !== "ready") return;
      expect(route.durationMinutes).toBe(36);
      expect(route.rerouted).toBe(true);
    });
  });

  test("a reviewed block on the shared choke point leaves no accessible route", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedNetwork(ctx);
      const now = Date.now();
      await ctx.db.insert("incidents", {
        stationId: ids.get("farringdon")!,
        kind: "lift-outage",
        status: "active",
        severity: "route-blocking",
        title: "Reviewed outage",
        description: "x",
        sourceType: "official",
        sourceName: "StepFree review",
        confidence: 0.9,
        humanReviewed: true,
        reportedAt: now,
        updatedAt: now,
      });
      const route = await calculateTransitRoute(ctx, "waterloo", "barbican");
      expect(route.status).toBe("blocked");
    });
  });

  test("an unknown station returns station-not-found", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
      const route = await calculateTransitRoute(ctx, "atlantis", "barbican");
      expect(route.status).toBe("station-not-found");
    });
  });

  test("identical origin and destination is rejected", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedNetwork(ctx);
      const route = await calculateTransitRoute(ctx, "waterloo", "waterloo");
      expect(route.status).toBe("same-station");
    });
  });
});
