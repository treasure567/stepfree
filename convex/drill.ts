import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { sha256 } from "./lib/crypto";
import { excerptIsVerbatim } from "./lib/excerpt";
import { rateLimiter } from "./lib/rateLimits";
import { validateSessionId } from "./lib/validation";

const BOND_STREET_SLUG = "bond-street";
const DRILL_CANDIDATE_KEY = "bond-street-lift-outage";

const drillSourceUrl =
  "https://tfl.gov.uk/status-updates/stations-lifts-and-escalators-works-and-closures?intcmp=54583";
const drillSourceName = "Transport for London planned accessibility works";
const drillModel = "gpt-5.4-mini";
const drillConfidence = 0.98;
const drillSourceMarkdown = [
  "# Stations, lifts and escalators: works and closures",
  "",
  "## Bond Street",
  "Bond Street: the lift to the Jubilee and Elizabeth line platforms is out of service until further notice. Step-free access from street to platform is not available. Customers are advised to use London Bridge for a step-free interchange.",
  "",
  "## Green Park",
  "All lifts at Green Park are operating normally.",
].join("\n");
const drillExcerpt =
  "the lift to the Jubilee and Elizabeth line platforms is out of service until further notice";

function evidenceForStation(stationSlug: string, stationName: string) {
  if (stationSlug === BOND_STREET_SLUG) {
    return {
      title: "Primary lift unavailable",
      description:
        "Step-free access through Bond Street is temporarily unavailable.",
      sourceName: drillSourceName,
      sourceUrl: drillSourceUrl,
      model: drillModel,
      sourceExcerpt: drillExcerpt,
      confidence: drillConfidence,
      candidateKey: DRILL_CANDIDATE_KEY,
      canonical: true as const,
    };
  }

  return {
    title: "Step-free access disrupted",
    description: `A reported lift disruption has removed step-free access at ${stationName}.`,
    sourceName: "StepFree controlled drill",
    sourceUrl: drillSourceUrl,
    model: drillModel,
    sourceExcerpt: undefined,
    confidence: 0.9,
    candidateKey: `${stationSlug}-lift-outage`,
    canonical: false as const,
  };
}

async function activeSessionOutage(
  ctx: QueryCtx | MutationCtx,
  sessionId: string,
) {
  return ctx.db
    .query("demoIncidents")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
}

export const state = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    const active = await activeSessionOutage(ctx, sessionId);
    const outage = active[0];
    const outageStation = outage ? await ctx.db.get(outage.stationId) : null;
    const sourceHash = await sha256(drillSourceMarkdown);

    return {
      outageActive: Boolean(outage),
      incident: outage
        ? {
            id: outage._id,
            stationName: outageStation?.name ?? null,
            title: outage.title,
            description: outage.description,
            sourceName: outage.sourceName,
            sourceUrl: outage.sourceUrl,
            sourceHash: outage.sourceHash,
            model: outage.model,
            sourceExcerpt: outage.sourceExcerpt,
            confidence: outage.confidence,
            acceptedBy: outage.acceptedBy,
            createdAt: outage.createdAt,
          }
        : null,
      candidate: {
        stationName: "Bond Street",
        kind: "lift-outage" as const,
        severity: "route-blocking" as const,
        confidence: drillConfidence,
        model: drillModel,
        sourceName: drillSourceName,
        sourceUrl: drillSourceUrl,
        sourceExcerpt: drillExcerpt,
        sourceHash,
        excerptVerified: excerptIsVerbatim(drillSourceMarkdown, drillExcerpt),
      },
    };
  },
});

export const simulateOutage = mutation({
  args: { sessionId: v.string(), stationSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "demoControlPerSession", {
      key: sessionId,
      throws: true,
    });
    const slug = args.stationSlug?.trim() || BOND_STREET_SLUG;
    const station = await ctx.db
      .query("stations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    if (!station) {
      throw new ConvexError({ code: "STATION_NOT_FOUND", slug });
    }

    const existing = await ctx.db
      .query("demoIncidents")
      .withIndex("by_session_station", (q) =>
        q.eq("sessionId", sessionId).eq("stationId", station._id),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) {
      return { created: false, incidentId: existing._id };
    }

    const evidence = evidenceForStation(slug, station.name);

    if (evidence.canonical && !excerptIsVerbatim(drillSourceMarkdown, drillExcerpt)) {
      throw new ConvexError({ code: "EXCERPT_NOT_VERIFIED" });
    }

    const now = Date.now();
    const sourceHash = evidence.canonical
      ? await sha256(drillSourceMarkdown)
      : undefined;
    const incidentId = await ctx.db.insert("demoIncidents", {
      sessionId,
      stationId: station._id,
      status: "active",
      severity: "route-blocking",
      kind: "lift-outage",
      title: evidence.title,
      description: evidence.description,
      sourceName: evidence.sourceName,
      sourceUrl: evidence.sourceUrl,
      sourceHash,
      model: evidence.model,
      sourceExcerpt: evidence.sourceExcerpt,
      confidence: evidence.confidence,
      candidateKey: evidence.candidateKey,
      acceptedBy: sessionId,
      createdAt: now,
      updatedAt: now,
    });

    return { created: true, incidentId };
  },
});

export const resolveOutage = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "demoControlPerSession", {
      key: sessionId,
      throws: true,
    });
    const active = await activeSessionOutage(ctx, sessionId);
    const now = Date.now();

    for (const incident of active) {
      await ctx.db.patch(incident._id, {
        status: "resolved",
        updatedAt: now,
        resolvedAt: now,
      });
    }

    return { resolved: active.length };
  },
});

export const reset = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    const all = await ctx.db
      .query("demoIncidents")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const incident of all) {
      await ctx.db.delete(incident._id);
    }

    return { cleared: all.length };
  },
});

export const attemptForgedIncident = mutation({
  args: {
    sessionId: v.string(),
    forgedExcerpt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "demoControlPerSession", {
      key: sessionId,
      throws: true,
    });
    const forgedExcerpt =
      args.forgedExcerpt?.trim() ||
      "Bond Street lift is fully operational and step-free access is available on every platform.";
    const verified = excerptIsVerbatim(drillSourceMarkdown, forgedExcerpt);

    if (verified) {
      return { rejected: false, verified: true, forgedExcerpt };
    }

    return {
      rejected: true,
      verified: false,
      code: "EXCERPT_NOT_VERIFIED" as const,
      guard: "verbatim-source-excerpt" as const,
      forgedExcerpt,
    };
  },
});
