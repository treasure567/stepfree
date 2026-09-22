import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { registerComponents } from "../test/register-components";
import { seedNetwork, blockingDemoIncident } from "../test/seed";
import { calculateTransitRoute } from "./lib/transit";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seeded() {
  const t = convexTest(schema, modules);
  registerComponents(t);
  await t.run(async (ctx) => {
    await seedNetwork(ctx);
  });
  const graph = await t.run(async (ctx) => {
    const stations = await ctx.db.query("stations").collect();
    const connections = await ctx.db.query("connections").collect();
    const edges: string[] = [];
    for (const c of connections) {
      edges.push(`${c.fromStationId}|${c.toStationId}`);
      edges.push(`${c.toStationId}|${c.fromStationId}`);
    }
    const idBySlug: Record<string, string> = {};
    for (const s of stations) idBySlug[s.slug] = s._id;
    return { slugs: stations.map((s) => s.slug), edges, idBySlug };
  });
  return {
    t,
    idBySlug: graph.idBySlug,
    slugs: graph.slugs,
    edges: new Set(graph.edges),
  };
}

describe("routing properties (all station pairs on the seeded network)", () => {
  test("every ready route is a valid connected path and routing is deterministic", async () => {
    const { t, slugs, edges } = await seeded();
    let readyCount = 0;

    for (const from of slugs) {
      for (const to of slugs) {
        if (from === to) continue;

        const first = await t.run((ctx) =>
          calculateTransitRoute(ctx, from, to),
        );
        const second = await t.run((ctx) =>
          calculateTransitRoute(ctx, from, to),
        );

        // Determinism: identical inputs produce identical output.
        expect(second).toEqual(first);

        if (first.status !== "ready") continue;
        readyCount += 1;

        // Endpoints are correct.
        expect(first.stations[0].slug).toBe(from);
        expect(first.stations[first.stations.length - 1].slug).toBe(to);

        // Every consecutive hop is a real connection, and the duration is positive.
        for (let i = 1; i < first.stations.length; i += 1) {
          const a = first.stations[i - 1].id;
          const b = first.stations[i].id;
          expect(edges.has(`${a}|${b}`)).toBe(true);
        }
        expect(first.durationMinutes).toBeGreaterThan(0);

        // A simple path never repeats a station.
        const seen = new Set(first.stations.map((s) => s.id));
        expect(seen.size).toBe(first.stations.length);
      }
    }

    expect(readyCount).toBeGreaterThan(0);
  });

  test("a blocked station never appears in any accepted route for that session", async () => {
    const { t, idBySlug, slugs } = await seeded();
    const blockedSlug = "london-bridge";
    const blockedId = idBySlug[blockedSlug] as Id<"stations">;
    const sessionId = "prop-block-0000-1111-2222";
    await t.run((ctx) => blockingDemoIncident(ctx, sessionId, blockedId));

    let sawReadyAvoidingBlock = false;

    for (const from of slugs) {
      for (const to of slugs) {
        if (from === to) continue;

        const route = await t.run((ctx) =>
          calculateTransitRoute(ctx, from, to, { sessionId }),
        );

        if (route.status !== "ready") continue;

        // The blocked station is excluded from every accepted route.
        const slugsInRoute = route.stations.map((s) => s.slug);
        expect(slugsInRoute).not.toContain(blockedSlug);
        if (from !== blockedSlug && to !== blockedSlug) {
          sawReadyAvoidingBlock = true;
        }
      }
    }

    // The block genuinely exercised the router (some pair still routed around it).
    expect(sawReadyAvoidingBlock).toBe(true);
  });
});
