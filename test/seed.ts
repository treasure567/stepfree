import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";

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

export async function seedNetwork(
  ctx: MutationCtx,
): Promise<Map<string, Id<"stations">>> {
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

export async function blockingDemoIncident(
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
