import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractionPool } from "./pools";
import { requireOps } from "./lib/auth";

const METRIC_CAP = 100;

export const metrics = query({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const [raised, escalated, pending, failedEvents, queued, sending] =
      await Promise.all([
        ctx.db
          .query("emergencies")
          .withIndex("by_status", (q) => q.eq("status", "raised"))
          .take(METRIC_CAP),
        ctx.db
          .query("emergencies")
          .withIndex("by_status", (q) => q.eq("status", "escalated"))
          .take(METRIC_CAP),
        ctx.db
          .query("incidentCandidates")
          .withIndex("by_review_status", (q) => q.eq("reviewStatus", "pending"))
          .take(METRIC_CAP),
        ctx.db
          .query("events")
          .withIndex("by_status", (q) => q.eq("status", "failed"))
          .take(METRIC_CAP),
        ctx.db
          .query("alerts")
          .withIndex("by_status", (q) => q.eq("status", "queued"))
          .take(METRIC_CAP),
        ctx.db
          .query("alerts")
          .withIndex("by_status", (q) => q.eq("status", "sending"))
          .take(METRIC_CAP),
      ]);
    return {
      activeEmergencies: raised.length + escalated.length,
      escalated: escalated.length,
      pendingCandidates: pending.length,
      failedEvents: failedEvents.length,
      inflightAlerts: queued.length + sending.length,
      cap: METRIC_CAP,
    };
  },
});

export const retryEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireOps(ctx);
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

export const retryFailedEvents = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const failed = await ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(50);
    let retried = 0;
    for (const event of failed) {
      await ctx.db.patch(event._id, { status: "pending" });
      await ctx.scheduler.runAfter(0, internal.events.dispatch, {
        eventId: event._id,
      });
      retried += 1;
    }
    return { retried };
  },
});

export const runEvidenceNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    await ctx.runMutation(internal.workflows.startEvidenceWorkflow, {});
    return { started: true };
  },
});

export const syncTflNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    await extractionPool.enqueueAction(ctx, internal.tfl.syncLiftDisruptions, {});
    return { queued: true };
  },
});

export const enqueueTflSync = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await extractionPool.enqueueAction(
      ctx,
      internal.tfl.syncLiftDisruptions,
      {},
    );
    return null;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const now = Date.now();
    const expired = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(200);
    let deleted = 0;
    for (const row of expired) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});

const STUCK_ALERT_MS = 1000 * 60 * 5;

export const reconcileStuckAlerts = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ requeued: number }> => {
    const cutoff = Date.now() - STUCK_ALERT_MS;
    const sending = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "sending"))
      .take(50);
    let requeued = 0;
    for (const alert of sending) {
      if (alert.updatedAt < cutoff) {
        await ctx.db.patch(alert._id, {
          status: "queued",
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.alerts.deliverAlert, {
          alertId: alert._id,
        });
        requeued += 1;
      }
    }
    return { requeued };
  },
});
