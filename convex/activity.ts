import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { requireOps } from "./lib/auth";

export const providerValidator = v.union(
  v.literal("convex"),
  v.literal("openai"),
  v.literal("firecrawl"),
  v.literal("agentmail"),
  v.literal("valhalla"),
  v.literal("tfl"),
  v.literal("system"),
);

export const levelValidator = v.union(
  v.literal("info"),
  v.literal("success"),
  v.literal("warn"),
  v.literal("error"),
);

type Provider =
  | "convex"
  | "openai"
  | "firecrawl"
  | "agentmail"
  | "valhalla"
  | "tfl"
  | "system";

type Level = "info" | "success" | "warn" | "error";

export type ActivityInput = {
  action: string;
  provider: Provider;
  summary: string;
  level?: Level;
  actor?: string;
  targetKind?: string;
  targetId?: string;
  metadata?: unknown;
};

export async function logActivity(ctx: MutationCtx, input: ActivityInput) {
  try {
    await ctx.db.insert("activity", {
      action: input.action,
      provider: input.provider,
      level: input.level ?? "info",
      summary: input.summary,
      actor: input.actor,
      targetKind: input.targetKind,
      targetId: input.targetId,
      metadata: input.metadata,
      createdAt: Date.now(),
    });
  } catch {
    /* telemetry is best-effort and never blocks the primary write */
  }
}

export const record = internalMutation({
  args: {
    action: v.string(),
    provider: providerValidator,
    summary: v.string(),
    level: v.optional(levelValidator),
    actor: v.optional(v.string()),
    targetKind: v.optional(v.string()),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, args);
    return null;
  },
});

export const recent = query({
  args: {
    limit: v.optional(v.number()),
    provider: v.optional(providerValidator),
    level: v.optional(levelValidator),
  },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const limit = Math.min(args.limit ?? 40, 200);
    if (args.provider) {
      return await ctx.db
        .query("activity")
        .withIndex("by_provider", (q) => q.eq("provider", args.provider!))
        .order("desc")
        .take(limit);
    }
    if (args.level) {
      return await ctx.db
        .query("activity")
        .withIndex("by_level", (q) => q.eq("level", args.level!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("activity").order("desc").take(limit);
  },
});

const PROVIDERS: Provider[] = [
  "convex",
  "openai",
  "firecrawl",
  "agentmail",
  "valhalla",
  "tfl",
  "system",
];

export const page = query({
  args: {
    provider: v.optional(providerValidator),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const base = args.provider
      ? ctx.db
          .query("activity")
          .withIndex("by_provider", (q) => q.eq("provider", args.provider!))
      : ctx.db.query("activity").withIndex("by_created");
    const scoped =
      args.from !== undefined || args.to !== undefined
        ? base.filter((q) => {
            if (args.from !== undefined && args.to !== undefined) {
              return q.and(
                q.gte(q.field("createdAt"), args.from),
                q.lte(q.field("createdAt"), args.to),
              );
            }
            if (args.from !== undefined) {
              return q.gte(q.field("createdAt"), args.from);
            }
            return q.lte(q.field("createdAt"), args.to!);
          })
        : base;
    return await scoped.order("desc").paginate(args.paginationOpts);
  },
});

export const stats = query({
  args: { window: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const window = Math.min(args.window ?? 500, 1_000);
    const rows = await ctx.db.query("activity").order("desc").take(window);
    const byProvider: Record<string, number> = {};
    for (const provider of PROVIDERS) {
      byProvider[provider] = 0;
    }
    const byLevel = { info: 0, success: 0, warn: 0, error: 0 };
    for (const row of rows) {
      byProvider[row.provider] = (byProvider[row.provider] ?? 0) + 1;
      byLevel[row.level] += 1;
    }
    return {
      total: rows.length,
      byProvider,
      byLevel,
      latestAt: rows[0]?.createdAt ?? null,
    };
  },
});
