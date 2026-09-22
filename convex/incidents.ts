import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { rateLimiter } from "./lib/rateLimits";
import { validateSessionId } from "./lib/validation";

export const getBondStreetStatus = query({
  args: {},
  handler: async (ctx) => {
    const station = await ctx.db
      .query("stations")
      .withIndex("by_slug", (q) => q.eq("slug", "bond-street"))
      .unique();

    if (!station) {
      return null;
    }

    const [lifts, activeIncidents, reports] = await Promise.all([
      ctx.db
        .query("lifts")
        .withIndex("by_station", (q) => q.eq("stationId", station._id))
        .collect(),
      ctx.db
        .query("incidents")
        .withIndex("by_station", (q) => q.eq("stationId", station._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect(),
      ctx.db
        .query("reports")
        .withIndex("by_station", (q) => q.eq("stationId", station._id))
        .collect(),
    ]);
    const lift = lifts[0];
    const incident = activeIncidents[0];

    return {
      stationId: station._id,
      stationName: station.name,
      liftId: lift?._id,
      liftStatus: lift?.status ?? "unknown",
      incident: incident
        ? {
            id: incident._id,
            title: incident.title,
            description: incident.description,
            sourceName: incident.sourceName,
            confidence: incident.confidence,
            updatedAt: incident.updatedAt,
            expectedReturnAt: lift?.expectedReturnAt,
          }
        : null,
      communityReports: reports.length,
      demoControlsEnabled: process.env.ALLOW_DEMO_CONTROLS === "true",
    };
  },
});

export const listMapIncidents = query({
  args: { sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const sessionId = args.sessionId?.trim() || undefined;
    const demoIncidents = sessionId
      ? await ctx.db
          .query("demoIncidents")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      : [];
    const merged = [
      ...incidents.map((incident) => ({
        id: incident._id as string,
        stationId: incident.stationId,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        sourceName: incident.sourceName,
        confidence: incident.confidence,
        updatedAt: incident.updatedAt,
        isDemo: false,
      })),
      ...demoIncidents.map((incident) => ({
        id: incident._id as string,
        stationId: incident.stationId,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        sourceName: incident.sourceName,
        confidence: incident.confidence,
        updatedAt: incident.updatedAt,
        isDemo: true,
      })),
    ];

    return Promise.all(
      merged.map(async (incident) => {
        const station = await ctx.db.get(incident.stationId);

        if (!station) {
          return null;
        }

        return {
          id: incident.id,
          stationId: station._id,
          stationName: station.name,
          latitude: station.latitude,
          longitude: station.longitude,
          title: incident.title,
          description: incident.description,
          severity: incident.severity,
          sourceName: incident.sourceName,
          confidence: incident.confidence,
          updatedAt: incident.updatedAt,
          isDemo: incident.isDemo,
        };
      }),
    ).then((results) => results.filter((incident) => incident !== null));
  },
});

export const setBondStreetLiftStatus = mutation({
  args: {
    status: v.union(v.literal("working"), v.literal("out-of-service")),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    if (process.env.ALLOW_DEMO_CONTROLS !== "true") {
      throw new ConvexError({ code: "DEMO_CONTROLS_DISABLED" });
    }

    const sessionId = validateSessionId(args.sessionId);
    await Promise.all([
      rateLimiter.limit(ctx, "demoControlGlobal", { throws: true }),
      rateLimiter.limit(ctx, "demoControlPerSession", {
        key: sessionId,
        throws: true,
      }),
    ]);
    const station = await ctx.db
      .query("stations")
      .withIndex("by_slug", (q) => q.eq("slug", "bond-street"))
      .unique();

    if (!station) {
      throw new Error("Bond Street has not been seeded");
    }

    const lift = await ctx.db
      .query("lifts")
      .withIndex("by_station", (q) => q.eq("stationId", station._id))
      .first();

    if (!lift) {
      throw new Error("Bond Street lift has not been seeded");
    }

    const activeIncident = await ctx.db
      .query("incidents")
      .withIndex("by_station", (q) => q.eq("stationId", station._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    const now = Date.now();

    if (args.status === "working") {
      if (lift.status === "working" && !activeIncident) {
        return { status: "working" as const, updatedAt: lift.lastCheckedAt };
      }

      await ctx.db.patch(lift._id, {
        status: "working",
        sourceType: "official",
        lastCheckedAt: now,
        expectedReturnAt: undefined,
      });

      if (activeIncident) {
        await ctx.db.patch(activeIncident._id, {
          status: "resolved",
          updatedAt: now,
          resolvedAt: now,
        });
      }

      return { status: "working" as const, updatedAt: now };
    }

    if (activeIncident && lift.status === "out-of-service") {
      return {
        status: "out-of-service" as const,
        incidentId: activeIncident._id,
        updatedAt: activeIncident.updatedAt,
      };
    }

    if (activeIncident) {
      await ctx.db.patch(lift._id, {
        status: "out-of-service",
        sourceType: "official",
        lastCheckedAt: now,
        expectedReturnAt: now + 45 * 60 * 1000,
      });
      return {
        status: "out-of-service" as const,
        incidentId: activeIncident._id,
        updatedAt: now,
      };
    }

    const incidentId = await ctx.db.insert("incidents", {
      stationId: station._id,
      liftId: lift._id,
      kind: "lift-outage",
      status: "active",
      severity: "route-blocking",
      title: "Primary lift unavailable",
      description: "Step-free access through Bond Street is temporarily unavailable.",
      sourceType: "official",
      sourceName: "StepFree verified demo feed",
      sourceUrl: "https://tfl.gov.uk/status-updates/",
      confidence: 0.98,
      reportedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(lift._id, {
      status: "out-of-service",
      sourceType: "official",
      lastCheckedAt: now,
      expectedReturnAt: now + 45 * 60 * 1000,
    });

    return { status: "out-of-service" as const, incidentId, updatedAt: now };
  },
});
