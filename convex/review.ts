import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const ACCEPTANCE_CONFIDENCE_THRESHOLD = 0.7;

function reviewBlockReason(candidate: Doc<"incidentCandidates">) {
  if (candidate.excerptVerified !== true) {
    return "EXCERPT_NOT_VERIFIED" as const;
  }

  if (!candidate.resolvedStationId) {
    return "STATION_UNKNOWN" as const;
  }

  if (candidate.confidence < ACCEPTANCE_CONFIDENCE_THRESHOLD) {
    return "LOW_CONFIDENCE" as const;
  }

  return null;
}

async function requireReviewer(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new ConvexError({ code: "UNAUTHORIZED_REVIEW" });
  }

  return userId as string;
}

export const pendingCandidates = query({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.db
      .query("incidentCandidates")
      .withIndex("by_review_status", (q) => q.eq("reviewStatus", "pending"))
      .order("desc")
      .take(50);

    return Promise.all(
      candidates.map(async (candidate) => {
        const run = await ctx.db.get(candidate.runId);
        const station = candidate.resolvedStationId
          ? await ctx.db.get(candidate.resolvedStationId)
          : null;
        const blockedReason = reviewBlockReason(candidate);

        return {
          id: candidate._id,
          stationName: candidate.stationName,
          resolvedStation: station?.name ?? null,
          kind: candidate.kind,
          title: candidate.title,
          description: candidate.description,
          severity: candidate.severity,
          confidence: candidate.confidence,
          sourceExcerpt: candidate.sourceExcerpt,
          excerptVerified: candidate.excerptVerified === true,
          acceptable: blockedReason === null,
          blockedReason,
          model: run?.model ?? null,
          sourceName: run?.sourceName ?? null,
          sourceUrl: run?.sourceUrl ?? null,
          sourceHash: run?.contentHash ?? null,
          createdAt: candidate.createdAt,
        };
      }),
    );
  },
});

export const acceptCandidate = mutation({
  args: { candidateId: v.id("incidentCandidates") },
  handler: async (ctx, args) => {
    const reviewer = await requireReviewer(ctx);
    const candidate = await ctx.db.get(args.candidateId);

    if (!candidate) {
      throw new ConvexError({ code: "CANDIDATE_NOT_FOUND" });
    }

    if (candidate.reviewStatus !== "pending") {
      throw new ConvexError({
        code: "CANDIDATE_NOT_PENDING",
        reviewStatus: candidate.reviewStatus,
      });
    }

    const blockedReason = reviewBlockReason(candidate);

    if (blockedReason !== null || !candidate.resolvedStationId) {
      throw new ConvexError({
        code: "CANDIDATE_NOT_ACCEPTABLE",
        reason: blockedReason ?? "STATION_UNKNOWN",
      });
    }

    const run = await ctx.db.get(candidate.runId);
    const now = Date.now();
    const incidentId = await ctx.db.insert("incidents", {
      stationId: candidate.resolvedStationId,
      kind: candidate.kind,
      status: "active",
      severity: candidate.severity,
      title: candidate.title,
      description: candidate.description,
      sourceType: "official",
      sourceName: run?.sourceName ?? "StepFree accessibility monitoring",
      sourceUrl: run?.sourceUrl,
      confidence: candidate.confidence,
      humanReviewed: true,
      reviewedBy: reviewer,
      reviewedAt: now,
      candidateId: candidate._id,
      sourceHash: run?.contentHash,
      model: run?.model,
      sourceExcerpt: candidate.sourceExcerpt,
      reportedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(candidate._id, {
      reviewStatus: "accepted",
      reviewedBy: reviewer,
      reviewedAt: now,
      incidentId,
    });
    await ctx.scheduler.runAfter(0, internal.alerts.evaluateStation, {
      stationId: candidate.resolvedStationId,
    });

    return { incidentId };
  },
});

export const rejectCandidate = mutation({
  args: {
    candidateId: v.id("incidentCandidates"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviewer = await requireReviewer(ctx);
    const candidate = await ctx.db.get(args.candidateId);

    if (!candidate) {
      throw new ConvexError({ code: "CANDIDATE_NOT_FOUND" });
    }

    if (candidate.reviewStatus !== "pending") {
      throw new ConvexError({
        code: "CANDIDATE_NOT_PENDING",
        reviewStatus: candidate.reviewStatus,
      });
    }

    const now = Date.now();
    await ctx.db.patch(candidate._id, {
      reviewStatus: "rejected",
      reviewReason: args.reason?.slice(0, 300),
      reviewedBy: reviewer,
      reviewedAt: now,
    });

    return { rejected: true };
  },
});
