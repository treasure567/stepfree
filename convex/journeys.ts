import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { rateLimiter } from "./lib/rateLimits";
import { calculateTransitRoute } from "./lib/transit";
import {
  validateIdempotencyKey,
  validateSessionId,
} from "./lib/validation";

export const save = mutation({
  args: {
    sessionId: v.string(),
    fromSlug: v.string(),
    toSlug: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
    const existing = await ctx.db
      .query("journeys")
      .withIndex("by_idempotency", (query) =>
        query.eq("idempotencyKey", idempotencyKey),
      )
      .unique();

    if (existing) {
      if (existing.sessionId !== sessionId) {
        throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT" });
      }

      return existing._id;
    }

    await Promise.all([
      rateLimiter.limit(ctx, "journeySavePerSession", {
        key: sessionId,
        throws: true,
      }),
      rateLimiter.limit(ctx, "journeySaveGlobal", { throws: true }),
    ]);
    const route = await calculateTransitRoute(
      ctx,
      args.fromSlug.trim(),
      args.toSlug.trim(),
      { sessionId },
    );

    if (route.status !== "ready") {
      throw new ConvexError({ code: "ROUTE_NOT_READY", status: route.status });
    }

    const authUserId = await getAuthUserId(ctx);
    const userId = authUserId as Id<"users"> | null;
    const now = Date.now();

    return ctx.db.insert("journeys", {
      userId: userId ?? undefined,
      sessionId,
      fromStationId: route.fromId,
      toStationId: route.toId,
      routeStationIds: route.routeStationIds,
      durationMinutes: route.durationMinutes,
      baselineDurationMinutes: route.baselineDurationMinutes,
      changes: route.changes,
      status: route.rerouted ? "rerouted" : "planned",
      incidentIds: route.incidentIds,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  },
});
