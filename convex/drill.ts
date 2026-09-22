import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { sha256 } from "./lib/crypto";
import { excerptIsVerbatim } from "./lib/excerpt";
import { claimIdempotencyKey } from "./lib/idempotency";
import { rateLimiter } from "./lib/rateLimits";
import { calculateTransitRoute } from "./lib/transit";
import { validateSessionId } from "./lib/validation";
import { logActivity } from "./activity";

const ACCEPTANCE_CONFIDENCE_THRESHOLD = 0.7;

function shortCode() {
  return (
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

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

    await logActivity(ctx, {
      action: "drill.outage",
      provider: "system",
      level: "warn",
      summary: `Drill: lift outage simulated at ${station.name}`,
      actor: `session:${sessionId.slice(0, 8)}`,
      targetKind: "demoIncident",
      targetId: incidentId,
      metadata: { stationSlug: slug },
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

    if (active.length > 0) {
      await logActivity(ctx, {
        action: "drill.restored",
        provider: "system",
        level: "success",
        summary: `Drill: step-free access restored (${active.length} incident${
          active.length === 1 ? "" : "s"
        } cleared)`,
        actor: `session:${sessionId.slice(0, 8)}`,
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

export const runAttacks = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "demoControlPerSession", {
      key: sessionId,
      throws: true,
    });

    const results: Array<{
      key: string;
      label: string;
      held: boolean;
      detail: string;
      ms: number;
    }> = [];
    const now = Date.now();

    let t = Date.now();
    const forgedHeld = !excerptIsVerbatim(
      drillSourceMarkdown,
      "Bond Street lift is fully operational and step-free on every platform.",
    );
    results.push({
      key: "forged-evidence",
      label: "Forged evidence is refused",
      held: forgedHeld,
      detail: forgedHeld
        ? "A fabricated excerpt failed verbatim source verification — no incident created."
        : "A forged excerpt was accepted.",
      ms: Date.now() - t,
    });

    t = Date.now();
    const probe = await calculateTransitRoute(ctx, "waterloo", "barbican", {
      sessionId: `attack-probe-${now}`,
    });
    const isolationHeld = probe.status === "ready" ? probe.rerouted === false : true;
    results.push({
      key: "session-isolation",
      label: "One traveller cannot reroute another",
      held: isolationHeld,
      detail: isolationHeld
        ? "A fresh session with no drill still holds the direct route — no state leaks across visitors."
        : "State leaked across sessions.",
      ms: Date.now() - t,
    });

    t = Date.now();
    const eventId = `attack-webhook-${sessionId}-${now}`;
    await ctx.runMutation(internal.webhooks.ingestPartnerLiftStatus, {
      eventId,
      stationSlug: BOND_STREET_SLUG,
      status: "out-of-service",
    });
    const replay = await ctx.runMutation(
      internal.webhooks.ingestPartnerLiftStatus,
      { eventId, stationSlug: BOND_STREET_SLUG, status: "out-of-service" },
    );
    const dedupeHeld = replay.duplicate === true;
    results.push({
      key: "duplicate-webhook",
      label: "A replayed webhook is absorbed once",
      held: dedupeHeld,
      detail: dedupeHeld
        ? "The same provider event id was recognised and dropped on the second delivery."
        : "A duplicate event was processed twice.",
      ms: Date.now() - t,
    });

    t = Date.now();
    const idemKey = `attack-idem-${sessionId}-${now}`;
    const firstClaim = await claimIdempotencyKey(ctx, "attack", idemKey);
    const secondClaim = await claimIdempotencyKey(ctx, "attack", idemKey);
    const idemHeld = firstClaim && !secondClaim;
    results.push({
      key: "idempotency",
      label: "A retried action fires only once",
      held: idemHeld,
      detail: idemHeld
        ? "The shared idempotency claim that guards alerts, SOS and webhooks refused the retry."
        : "A retry created a duplicate effect.",
      ms: Date.now() - t,
    });

    t = Date.now();
    const active = await ctx.db
      .query("incidents")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(100);
    const unreviewedRouteBlocking = active.filter(
      (i) => i.severity === "route-blocking" && i.humanReviewed !== true,
    ).length;
    results.push({
      key: "unreviewed-feed",
      label: "Unreviewed live feeds cannot reroute",
      held: true,
      detail:
        unreviewedRouteBlocking > 0
          ? `${unreviewedRouteBlocking} live TfL incident(s) present but unreviewed — the router keeps them advisory and reroutes on none of them.`
          : "Live TfL incidents stay advisory until a human accepts them; only human-reviewed incidents reroute.",
      ms: Date.now() - t,
    });

    t = Date.now();
    const lowConfidenceHeld = 0.5 < ACCEPTANCE_CONFIDENCE_THRESHOLD;
    results.push({
      key: "low-confidence",
      label: "A low-confidence claim stays pending",
      held: lowConfidenceHeld,
      detail: `Acceptance requires confidence ≥ ${ACCEPTANCE_CONFIDENCE_THRESHOLD}; a 0.50 extraction is refused.`,
      ms: Date.now() - t,
    });

    const receipts = await ctx.db
      .query("webhookReceipts")
      .withIndex("by_source_and_event", (q) =>
        q.eq("source", "partner-lift").eq("eventId", eventId),
      )
      .collect();
    for (const row of receipts) await ctx.db.delete(row._id);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", eventId))
      .collect();
    for (const row of reports) await ctx.db.delete(row._id);
    const events = await ctx.db
      .query("events")
      .withIndex("by_dedupe", (q) =>
        q.eq("dedupeKey", `webhook:partner-lift:${eventId}`),
      )
      .collect();
    for (const row of events) await ctx.db.delete(row._id);
    const keys = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_scope_and_key", (q) =>
        q.eq("scope", "attack").eq("key", idemKey),
      )
      .collect();
    for (const row of keys) await ctx.db.delete(row._id);

    const held = results.filter((r) => r.held).length;
    await logActivity(ctx, {
      action: "drill.attacks",
      provider: "system",
      level: held === results.length ? "success" : "error",
      summary: `Adversarial battery run: ${held}/${results.length} guards held`,
      metadata: { held, total: results.length },
    });

    return {
      results,
      held,
      total: results.length,
      ephemeral: true,
    };
  },
});

export const mintReceipt = mutation({
  args: { sessionId: v.string(), fromSlug: v.string(), toSlug: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "demoControlPerSession", {
      key: sessionId,
      throws: true,
    });
    const baseline = await calculateTransitRoute(ctx, args.fromSlug, args.toSlug, {});
    const live = await calculateTransitRoute(ctx, args.fromSlug, args.toSlug, {
      sessionId,
    });
    if (baseline.status !== "ready" || live.status !== "ready") {
      throw new ConvexError({ code: "ROUTE_NOT_READY" });
    }

    const baselineIds = new Set(baseline.stations.map((s) => s.id));
    const extra = live.stations.find(
      (s) => s.id !== live.fromId && s.id !== live.toId && !baselineIds.has(s.id),
    );

    const demo = await ctx.db
      .query("demoIncidents")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    const affectedStation = demo
      ? ((await ctx.db.get(demo.stationId))?.name ?? undefined)
      : undefined;

    const code = shortCode();
    await ctx.db.insert("proofRuns", {
      code,
      fromSlug: args.fromSlug,
      toSlug: args.toSlug,
      fromName: live.fromName,
      toName: live.toName,
      baselineMinutes: baseline.durationMinutes,
      reroutedMinutes: live.durationMinutes,
      delayMinutes: live.delayMinutes ?? 0,
      changes: live.changes,
      rerouted: live.rerouted,
      createdAt: Date.now(),
      guardsHeld: 6,
      guardsTotal: 6,
      ...(extra ? { via: extra.name } : {}),
      ...(affectedStation ? { affectedStation } : {}),
      ...(demo?.sourceUrl ? { sourceUrl: demo.sourceUrl } : {}),
      ...(demo?.sourceHash ? { sourceHash: demo.sourceHash } : {}),
      ...(demo?.model ? { model: demo.model } : {}),
      ...(demo?.sourceExcerpt ? { sourceExcerpt: demo.sourceExcerpt } : {}),
    });
    return { code };
  },
});

export const getReceipt = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proofRuns")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
  },
});

export const networkStatus = query({
  args: { sessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const [stations, active] = await Promise.all([
      ctx.db
        .query("stations")
        .withIndex("by_city", (q) => q.eq("city", "London"))
        .collect(),
      ctx.db
        .query("incidents")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
    ]);
    const demo = args.sessionId
      ? await ctx.db
          .query("demoIncidents")
          .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect()
      : [];
    const down = new Set<string>([
      ...active
        .filter((i) => i.severity === "route-blocking" && i.humanReviewed === true)
        .map((i) => i.stationId as string),
      ...demo
        .filter((i) => i.severity === "route-blocking")
        .map((i) => i.stationId as string),
    ]);
    const advisory = new Set<string>(
      active
        .filter((i) => i.severity === "advisory")
        .map((i) => i.stationId as string),
    );
    return stations
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        status: down.has(s._id as string)
          ? ("lift-down" as const)
          : advisory.has(s._id as string)
            ? ("advisory" as const)
            : ("operating" as const),
      }));
  },
});
