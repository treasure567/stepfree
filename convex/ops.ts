import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractionPool } from "./pools";

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
