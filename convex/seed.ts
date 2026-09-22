import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const stationSeeds = [
  {
    slug: "waterloo",
    name: "Waterloo",
    city: "London",
    latitude: 51.5033,
    longitude: -0.1147,
    lines: ["Jubilee", "Northern", "Bakerloo", "Waterloo & City"],
    externalIds: ["HUBWAT", "940GZZLUWLO"],
    stepFreeAccess: "street-to-platform" as const,
  },
  {
    slug: "westminster",
    name: "Westminster",
    city: "London",
    latitude: 51.501,
    longitude: -0.1254,
    lines: ["Jubilee", "District", "Circle"],
    externalIds: ["HUBWSM", "940GZZLUWSM"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "green-park",
    name: "Green Park",
    city: "London",
    latitude: 51.5067,
    longitude: -0.1428,
    lines: ["Jubilee", "Victoria", "Piccadilly"],
    externalIds: ["940GZZLUGPK"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "bond-street",
    name: "Bond Street",
    city: "London",
    latitude: 51.5142,
    longitude: -0.1494,
    lines: ["Central", "Jubilee", "Elizabeth"],
    externalIds: ["HUBBDS", "940GZZLUBND"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "farringdon",
    name: "Farringdon",
    city: "London",
    latitude: 51.52,
    longitude: -0.1053,
    lines: ["Elizabeth", "Metropolitan", "Circle", "Thameslink"],
    externalIds: ["HUBZFD", "940GZZLUFCN"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "barbican",
    name: "Barbican",
    city: "London",
    latitude: 51.5204,
    longitude: -0.0979,
    lines: ["Metropolitan", "Circle", "Hammersmith & City"],
    externalIds: ["940GZZLUBBN"],
    stepFreeAccess: "street-to-platform" as const,
  },
  {
    slug: "london-bridge",
    name: "London Bridge",
    city: "London",
    latitude: 51.5055,
    longitude: -0.0865,
    lines: ["Jubilee", "Northern", "Thameslink"],
    externalIds: ["HUBLBG", "940GZZLULNB"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "liverpool-street",
    name: "Liverpool Street",
    city: "London",
    latitude: 51.5178,
    longitude: -0.0823,
    lines: [
      "Central",
      "Circle",
      "Hammersmith & City",
      "Metropolitan",
      "Elizabeth",
    ],
    externalIds: ["HUBLST", "940GZZLULVT"],
    stepFreeAccess: "street-to-train" as const,
  },
  {
    slug: "victoria",
    name: "Victoria",
    city: "London",
    latitude: 51.4965,
    longitude: -0.1447,
    lines: ["Victoria", "District", "Circle"],
    externalIds: ["HUBVIC", "940GZZLUVIC"],
    stepFreeAccess: "street-to-train" as const,
  },
];

const connectionSeeds = [
  ["waterloo", "westminster", "Jubilee", 4, 1],
  ["westminster", "green-park", "Jubilee", 3, 1],
  ["green-park", "bond-street", "Jubilee", 3, 1],
  ["bond-street", "farringdon", "Elizabeth", 5, 1],
  ["farringdon", "barbican", "Metropolitan", 3, 1],
  ["waterloo", "london-bridge", "Jubilee", 6, 1],
  ["london-bridge", "farringdon", "Thameslink", 15, 2],
  ["barbican", "liverpool-street", "Metropolitan", 4, 1],
  ["green-park", "victoria", "Victoria", 3, 1],
] as const;

export const seedNetwork = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existingStations = await ctx.db.query("stations").collect();
    const wasEmpty = existingStations.length === 0;
    const stationIds = new Map<string, Id<"stations">>();
    let createdStations = 0;

    for (const station of stationSeeds) {
      const existingStation = existingStations.find(
        (candidate) => candidate.slug === station.slug,
      );
      const stationData = {
        ...station,
        sourceName: "StepFree curated pilot network",
        sourceUrl: "https://tfl.gov.uk/transport-accessibility/",
        lastVerifiedAt: now,
      };
      const stationId = existingStation?._id ?? await ctx.db.insert("stations", stationData);

      if (existingStation) {
        await ctx.db.patch(existingStation._id, stationData);
      } else {
        createdStations += 1;
      }

      stationIds.set(station.slug, stationId);
    }

    const liftIds = new Map<string, Id<"lifts">>();
    let createdLifts = 0;

    for (const station of stationSeeds) {
      const stationId = stationIds.get(station.slug);

      if (!stationId) {
        throw new Error(`Missing station ${station.slug}`);
      }

      const existingLift = await ctx.db
        .query("lifts")
        .withIndex("by_station", (q) => q.eq("stationId", stationId))
        .first();
      const liftId = existingLift?._id ?? await ctx.db.insert("lifts", {
        stationId,
        name: "Primary street-to-platform lift",
        status: "working",
        sourceType: "official",
        lastCheckedAt: now,
        expectedReturnAt: undefined,
      });

      if (!existingLift) {
        createdLifts += 1;
      }

      liftIds.set(station.slug, liftId);
    }

    const existingConnections = await ctx.db.query("connections").collect();
    let createdConnections = 0;

    for (const [fromSlug, toSlug, line, durationMinutes, accessibilityMinutes] of connectionSeeds) {
      const fromStationId = stationIds.get(fromSlug);
      const toStationId = stationIds.get(toSlug);

      if (!fromStationId || !toStationId) {
        throw new Error(`Missing connection station ${fromSlug} or ${toSlug}`);
      }

      const existingConnection = existingConnections.find(
        (connection) =>
          connection.line === line &&
          ((connection.fromStationId === fromStationId &&
            connection.toStationId === toStationId) ||
            (connection.fromStationId === toStationId &&
              connection.toStationId === fromStationId)),
      );
      const connectionData = {
        fromStationId,
        toStationId,
        line,
        durationMinutes,
        accessibilityMinutes,
      };

      if (existingConnection) {
        await ctx.db.patch(existingConnection._id, connectionData);
      } else {
        await ctx.db.insert("connections", connectionData);
        createdConnections += 1;
      }
    }

    const bondStreetId = stationIds.get("bond-street");
    const bondStreetLiftId = liftIds.get("bond-street");

    if (!bondStreetId || !bondStreetLiftId) {
      throw new Error("Bond Street seed data is incomplete");
    }

    const staleDemoIncidents = await ctx.db
      .query("incidents")
      .withIndex("by_station", (q) => q.eq("stationId", bondStreetId))
      .filter((q) => q.eq(q.field("sourceName"), "StepFree verified demo feed"))
      .collect();

    for (const incident of staleDemoIncidents) {
      if (incident.status === "active") {
        await ctx.db.patch(incident._id, {
          status: "resolved",
          updatedAt: now,
          resolvedAt: now,
        });
      }
    }

    const bondStreetLift = await ctx.db.get(bondStreetLiftId);

    if (bondStreetLift && bondStreetLift.status !== "working") {
      await ctx.db.patch(bondStreetLiftId, {
        status: "working",
        lastCheckedAt: now,
        expectedReturnAt: undefined,
      });
    }

    return {
      seeded: wasEmpty,
      stations: stationSeeds.length,
      connections: connectionSeeds.length,
      createdStations,
      createdLifts,
      createdConnections,
    };
  },
});
