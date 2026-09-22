import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { normalizeStationName } from "./lib/stations";
import { logActivity } from "./activity";

function providerForFailure(
  code: string,
): "firecrawl" | "openai" | "system" {
  if (code.startsWith("FIRECRAWL")) {
    return "firecrawl";
  }
  if (code.startsWith("OPENAI")) {
    return "openai";
  }
  return "system";
}

const candidateValidator = v.object({
  stationName: v.string(),
  dateText: v.string(),
  kind: v.union(
    v.literal("lift-outage"),
    v.literal("access-obstruction"),
    v.literal("station-closure"),
  ),
  title: v.string(),
  description: v.string(),
  severity: v.union(v.literal("advisory"), v.literal("route-blocking")),
  alternateAccess: v.string(),
  confidence: v.number(),
  sourceExcerpt: v.string(),
  excerptVerified: v.boolean(),
});

export const startRun = internalMutation({
  args: {
    sourceName: v.string(),
    sourceUrl: v.string(),
    contentHash: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("monitoringRuns")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
      .first();

    if (existing) {
      const isStale =
        existing.status === "processing" &&
        args.startedAt - existing.startedAt > 15 * 60 * 1_000;

      if (existing.status === "failed" || isStale) {
        await ctx.db.patch(existing._id, {
          status: "processing",
          candidateCount: 0,
          model: undefined,
          startedAt: args.startedAt,
          completedAt: undefined,
          failureCode: undefined,
        });

        return {
          runId: existing._id,
          created: true,
          status: "processing" as const,
          candidateCount: 0,
        };
      }

      return {
        runId: existing._id,
        created: false,
        status: existing.status,
        candidateCount: existing.candidateCount,
      };
    }

    const runId = await ctx.db.insert("monitoringRuns", {
      sourceName: args.sourceName,
      sourceUrl: args.sourceUrl,
      contentHash: args.contentHash,
      status: "processing",
      candidateCount: 0,
      startedAt: args.startedAt,
    });

    await logActivity(ctx, {
      action: "evidence.scraped",
      provider: "firecrawl",
      level: "success",
      summary: `Firecrawl fetched the official ${args.sourceName} page`,
      targetKind: "monitoringRun",
      targetId: runId,
      metadata: { contentHash: args.contentHash.slice(0, 12) },
    });

    return {
      runId,
      created: true,
      status: "processing" as const,
      candidateCount: 0,
    };
  },
});

export const recordFetchFailure = internalMutation({
  args: {
    sourceName: v.string(),
    sourceUrl: v.string(),
    contentHash: v.string(),
    failureCode: v.string(),
    failedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("monitoringRuns", {
      sourceName: args.sourceName,
      sourceUrl: args.sourceUrl,
      contentHash: args.contentHash,
      status: "failed",
      candidateCount: 0,
      startedAt: args.failedAt,
      completedAt: args.failedAt,
      failureCode: args.failureCode,
    });
    await logActivity(ctx, {
      action: "evidence.failed",
      provider: providerForFailure(args.failureCode),
      level: "error",
      summary: `Could not fetch the official source (${args.failureCode})`,
      targetKind: "monitoringRun",
      targetId: runId,
    });
    return runId;
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("monitoringRuns"),
    model: v.string(),
    completedAt: v.number(),
    candidates: v.array(candidateValidator),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (!run || run.status !== "processing") {
      return { completed: false, candidateCount: run?.candidateCount ?? 0 };
    }

    const stations = await ctx.db.query("stations").collect();
    const stationIdByName = new Map(
      stations.map((station) => [normalizeStationName(station.name), station._id]),
    );
    const seen = new Set<string>();
    let candidateCount = 0;

    for (const candidate of args.candidates) {
      const key = [
        candidate.stationName.toLowerCase(),
        candidate.dateText.toLowerCase(),
        candidate.title.toLowerCase(),
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      candidateCount += 1;
      const resolvedStationId = stationIdByName.get(
        normalizeStationName(candidate.stationName),
      );
      await ctx.db.insert("incidentCandidates", {
        runId: args.runId,
        ...candidate,
        resolvedStationId,
        reviewStatus: "pending",
        createdAt: args.completedAt,
      });
    }

    await ctx.db.patch(args.runId, {
      status: "completed",
      candidateCount,
      model: args.model,
      completedAt: args.completedAt,
      failureCode: undefined,
    });

    await logActivity(ctx, {
      action: "evidence.extracted",
      provider: "openai",
      level: "success",
      summary: `OpenAI (${args.model}) extracted ${candidateCount} incident candidate${
        candidateCount === 1 ? "" : "s"
      } from the official page`,
      targetKind: "monitoringRun",
      targetId: args.runId,
      metadata: { model: args.model, candidateCount },
    });

    return { completed: true, candidateCount };
  },
});

export const failRun = internalMutation({
  args: {
    runId: v.id("monitoringRuns"),
    failureCode: v.string(),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (!run || run.status !== "processing") {
      return { recorded: false };
    }

    await ctx.db.patch(args.runId, {
      status: "failed",
      failureCode: args.failureCode,
      completedAt: args.completedAt,
    });

    await logActivity(ctx, {
      action: "evidence.failed",
      provider: providerForFailure(args.failureCode),
      level: "error",
      summary: `Evidence run failed (${args.failureCode})`,
      targetKind: "monitoringRun",
      targetId: args.runId,
    });

    return { recorded: true };
  },
});

export const latestEvidence = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("monitoringRuns")
      .withIndex("by_started_at")
      .order("desc")
      .take(10);
    const latest = runs.find((run) => run.status === "completed");

    if (!latest) {
      return null;
    }

    return {
      sourceName: latest.sourceName,
      sourceUrl: latest.sourceUrl,
      candidateCount: latest.candidateCount,
      model: latest.model,
      checkedAt: latest.completedAt ?? latest.startedAt,
    };
  },
});
