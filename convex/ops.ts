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
