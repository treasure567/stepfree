import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/core";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { rateLimiter } from "./lib/rateLimits";
import {
  validateIdempotencyKey,
  validateSessionId,
} from "./lib/validation";

export const submit = mutation({
  args: {
    stationId: v.id("stations"),
    liftId: v.optional(v.id("lifts")),
    sessionId: v.string(),
    idempotencyKey: v.string(),
    observation: v.union(
      v.literal("working"),
      v.literal("not-working"),
      v.literal("obstructed"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
    const note = args.note?.trim();

    if (note && note.length > 500) {
      throw new ConvexError({ code: "NOTE_TOO_LONG", maximumLength: 500 });
    }

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_idempotency", (query) =>
        query.eq("idempotencyKey", idempotencyKey),
      )
      .unique();

    if (existing) {
      if (existing.sessionId !== sessionId) {
        throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT" });
      }

      return { accepted: true, reportId: existing._id, deduplicated: true };
    }

    const station = await ctx.db.get(args.stationId);

    if (!station) {
      throw new ConvexError({ code: "STATION_NOT_FOUND" });
    }

    if (args.liftId) {
      const lift = await ctx.db.get(args.liftId);

      if (!lift || lift.stationId !== args.stationId) {
        throw new ConvexError({ code: "LIFT_STATION_MISMATCH" });
      }
    }

    await Promise.all([
      rateLimiter.limit(ctx, "communityReportPerSession", {
        key: sessionId,
        throws: true,
      }),
      rateLimiter.limit(ctx, "communityReportGlobal", { throws: true }),
    ]);
    const authUserId = await getAuthUserId(ctx);
    const userId = authUserId as Id<"users"> | null;
    const recentReports = await ctx.db
      .query("reports")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(10);
    const duplicate = recentReports.find(
      (report) =>
        report.stationId === args.stationId &&
        report.observation === args.observation &&
        Date.now() - report.createdAt < 5 * 60 * 1000,
    );

    if (duplicate) {
      return {
        accepted: false,
        reason: "duplicate" as const,
        deduplicated: true,
      };
    }

    const reportId = await ctx.db.insert("reports", {
      stationId: args.stationId,
      liftId: args.liftId,
      userId: userId ?? undefined,
      sessionId,
      observation: args.observation,
      note: note || undefined,
      idempotencyKey,
      reviewStatus: "pending",
      createdAt: Date.now(),
    });

    return { accepted: true, reportId, deduplicated: false };
  },
});
