import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { calculateTransitRoute } from "./lib/transit";
import { normalizeEmail } from "./lib/validation";

export const subscribe = mutation({
  args: {
    fromSlug: v.string(),
    toSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const user = await ctx.db.get(userId);

    if (!user) {
      throw new ConvexError({ code: "USER_NOT_FOUND" });
    }

    if (!user.email || !user.emailVerifiedAt) {
      throw new ConvexError({ code: "EMAIL_NOT_VERIFIED" });
    }

    const fromSlug = args.fromSlug.trim();
    const toSlug = args.toSlug.trim();
    const route = await calculateTransitRoute(ctx, fromSlug, toSlug);

    if (route.status !== "ready" && route.status !== "blocked") {
      throw new ConvexError({
        code: "ROUTE_NOT_WATCHABLE",
        status: route.status,
      });
    }

    const existing = await ctx.db
      .query("routeWatches")
      .withIndex("by_user_route", (q) =>
        q
          .eq("userId", userId)
          .eq("fromStationId", route.fromId)
          .eq("toStationId", route.toId),
      )
      .collect();
    const activeExisting = existing.find((watch) => watch.status === "active");

    if (activeExisting) {
      return { watchId: activeExisting._id, created: false };
    }

    const now = Date.now();
    const watchId = await ctx.db.insert("routeWatches", {
      userId,
      email: user.email,
      emailNormalized: user.emailNormalized ?? normalizeEmail(user.email),
      fromStationId: route.fromId,
      toStationId: route.toId,
      fromSlug,
      toSlug,
      mobilityMode: user.mobilityMode,
      status: "active",
      baselineFingerprint: route.baselineFingerprint,
      lastNotifiedFingerprint: route.fingerprint,
      lastRerouted: route.status === "ready" ? route.rerouted : true,
      createdAt: now,
      updatedAt: now,
    });

    for (const stationId of route.baselineStationIds) {
      await ctx.db.insert("watchStations", { watchId, stationId });
    }

    return { watchId, created: true };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    const watches = await ctx.db
      .query("routeWatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return Promise.all(
      watches
        .filter((watch) => watch.status !== "cancelled")
        .map(async (watch) => {
          const latestAlert = await ctx.db
            .query("alerts")
            .withIndex("by_watch", (q) => q.eq("watchId", watch._id))
            .order("desc")
            .first();

          return {
            id: watch._id,
            fromSlug: watch.fromSlug,
            toSlug: watch.toSlug,
            status: watch.status,
            lastRerouted: watch.lastRerouted ?? false,
            createdAt: watch.createdAt,
            latestAlert: latestAlert
              ? {
                  status: latestAlert.status,
                  reason: latestAlert.reason,
                  providerMessageId: latestAlert.providerMessageId,
                  sentAt: latestAlert.sentAt,
                  createdAt: latestAlert.createdAt,
                }
              : null,
          };
        }),
    );
  },
});

export const cancel = mutation({
  args: { watchId: v.id("routeWatches") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new ConvexError({ code: "UNAUTHORIZED" });
    }

    const watch = await ctx.db.get(args.watchId);

    if (!watch) {
      throw new ConvexError({ code: "WATCH_NOT_FOUND" });
    }

    if (watch.userId !== userId) {
      throw new ConvexError({ code: "FORBIDDEN" });
    }

    const now = Date.now();
    await ctx.db.patch(watch._id, { status: "cancelled", updatedAt: now });
    const stationLinks = await ctx.db
      .query("watchStations")
      .withIndex("by_watch", (q) => q.eq("watchId", watch._id))
      .collect();

    for (const link of stationLinks) {
      await ctx.db.delete(link._id);
    }

    return { cancelled: true };
  },
});
