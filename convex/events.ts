import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { deliveryPool } from "./pools";

type PublishResult = { eventId: Id<"events">; published: boolean };

export async function publishEvent(
  ctx: MutationCtx,
  args: { type: string; dedupeKey: string; data: unknown },
): Promise<PublishResult> {
  const existing = await ctx.db
    .query("events")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
    .unique();
  if (existing) {
    return { eventId: existing._id, published: false };
  }
  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    type: args.type,
    dedupeKey: args.dedupeKey,
    data: args.data,
    status: "pending",
    attempts: 0,
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.events.dispatch, { eventId });
  return { eventId, published: true };
}

export const publish = internalMutation({
  args: { type: v.string(), dedupeKey: v.string(), data: v.any() },
  handler: async (ctx, args): Promise<PublishResult> => {
    return await publishEvent(ctx, args);
  },
});

export const dispatch = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status !== "pending") {
      return null;
    }
    try {
      const data = (event.data ?? {}) as { emergencyId?: Id<"emergencies"> };
      if (
        (event.type === "emergency.raised" ||
          event.type === "emergency.escalated") &&
        data.emergencyId
      ) {
        await deliveryPool.enqueueAction(
          ctx,
          internal.emergency.deliverNotification,
          {
            emergencyId: data.emergencyId,
            reason: event.type === "emergency.raised" ? "raised" : "escalated",
          },
        );
      }
      await ctx.db.patch(args.eventId, {
        status: "dispatched",
        dispatchedAt: Date.now(),
      });
    } catch (error) {
      await ctx.db.patch(args.eventId, {
        status: "failed",
        attempts: event.attempts + 1,
        error: error instanceof Error ? error.message : "dispatch failed",
      });
    }
    return null;
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    return await ctx.db.query("events").order("desc").take(limit);
  },
});

export const byType = query({
  args: { type: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    return await ctx.db
      .query("events")
      .withIndex("by_type_and_created", (q) => q.eq("type", args.type))
      .order("desc")
      .take(limit);
  },
});

export const failed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(limit);
  },
});

export const pending = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    return await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(limit);
  },
});

export const retry = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ retried: boolean }> => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.status !== "failed") {
      return { retried: false };
    }
    await ctx.db.patch(args.eventId, { status: "pending" });
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventId: args.eventId,
    });
    return { retried: true };
  },
});
