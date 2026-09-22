import { getAuthUserId } from "@convex-dev/auth/core";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { claimIdempotencyKey } from "./lib/idempotency";
import { rateLimiter } from "./lib/rateLimits";
import { publishEvent } from "./events";

const ESCALATION_WINDOW_MS = 90_000;

const kindValidator = v.union(
  v.literal("stuck-no-lift"),
  v.literal("trapped-in-lift"),
  v.literal("needs-assistance"),
);

const reasonValidator = v.union(v.literal("raised"), v.literal("escalated"));

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return "•••";
  }
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

function windowBucket(now: number): number {
  return Math.floor(now / ESCALATION_WINDOW_MS);
}

async function requireOps(ctx: QueryCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({ code: "UNAUTHORIZED_OPS" });
  }
  return userId as string;
}

export const raise = mutation({
  args: {
    sessionId: v.string(),
    kind: kindValidator,
    stationSlug: v.optional(v.string()),
    journeyId: v.optional(v.id("journeys")),
    note: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "emergencyGlobal", { throws: true });
    await rateLimiter.limit(ctx, "emergencyPerSession", {
      key: args.sessionId,
      throws: true,
    });

    const now = Date.now();
    const idempotencyKey = `${args.sessionId}:${args.kind}:${windowBucket(now)}`;
    const claimed = await claimIdempotencyKey(ctx, "emergency", idempotencyKey);
    if (!claimed) {
      const existing = await ctx.db
        .query("emergencies")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", idempotencyKey),
        )
        .unique();
      if (existing) {
        return {
          emergencyId: existing._id,
          status: existing.status,
          duplicate: true,
        };
      }
    }

    let stationId: Id<"stations"> | undefined;
    if (args.stationSlug) {
      const station = await ctx.db
        .query("stations")
        .withIndex("by_slug", (q) => q.eq("slug", args.stationSlug!))
        .unique();
      stationId = station?._id;
    }

    const emergencyId = await ctx.db.insert("emergencies", {
      sessionId: args.sessionId,
      kind: args.kind,
      status: "raised",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
      ...(stationId ? { stationId } : {}),
      ...(args.stationSlug ? { stationSlug: args.stationSlug } : {}),
      ...(args.journeyId ? { journeyId: args.journeyId } : {}),
      ...(args.note ? { note: args.note } : {}),
      ...(args.contactEmail
        ? {
            contactEmail: args.contactEmail,
            contactMasked: maskEmail(args.contactEmail),
          }
        : {}),
    });

    await publishEvent(ctx, {
      type: "emergency.raised",
      dedupeKey: `emergency.raised:${emergencyId}`,
      data: { emergencyId },
    });

    await ctx.runMutation(internal.workflows.startEmergencyEscalation, {
      emergencyId,
      windowMs: ESCALATION_WINDOW_MS,
    });

    return { emergencyId, status: "raised" as const, duplicate: false };
  },
});

export const acknowledge = mutation({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    const operator = await requireOps(ctx);
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    if (emergency.status === "resolved" || emergency.status === "cancelled") {
      return { status: emergency.status };
    }
    const now = Date.now();
    await ctx.db.patch(args.emergencyId, {
      status: "acknowledged",
      acknowledgedBy: operator,
      acknowledgedAt: now,
      updatedAt: now,
    });
    return { status: "acknowledged" as const };
  },
});

export const resolve = mutation({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    const now = Date.now();
    await ctx.db.patch(args.emergencyId, {
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    });
    return { status: "resolved" as const };
  },
});

export const cancel = mutation({
  args: { emergencyId: v.id("emergencies"), sessionId: v.string() },
  handler: async (ctx, args) => {
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    if (emergency.sessionId !== args.sessionId) {
      throw new ConvexError({ code: "NOT_EMERGENCY_OWNER" });
    }
    if (emergency.status === "resolved" || emergency.status === "cancelled") {
      return { status: emergency.status };
    }
    const now = Date.now();
    await ctx.db.patch(args.emergencyId, {
      status: "cancelled",
      resolvedAt: now,
      updatedAt: now,
    });
    return { status: "cancelled" as const };
  },
});

export const get = query({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.emergencyId);
  },
});

export const forSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emergencies")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(20);
  },
});

export const listForStation = query({
  args: { stationId: v.id("stations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emergencies")
      .withIndex("by_station", (q) => q.eq("stationId", args.stationId))
      .order("desc")
      .take(50);
  },
});

export const active = query({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const escalated = await ctx.db
      .query("emergencies")
      .withIndex("by_status", (q) => q.eq("status", "escalated"))
      .order("desc")
      .take(50);
    const raised = await ctx.db
      .query("emergencies")
      .withIndex("by_status", (q) => q.eq("status", "raised"))
      .order("desc")
      .take(50);
    return [...escalated, ...raised];
  },
});

export const isAwaitingAcknowledgement = internalQuery({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args): Promise<boolean> => {
    const emergency = await ctx.db.get(args.emergencyId);
    return emergency?.status === "raised";
  },
});

export const markEscalated = internalMutation({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args): Promise<null> => {
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency || emergency.status !== "raised") {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(args.emergencyId, {
      status: "escalated",
      escalatedAt: now,
      updatedAt: now,
    });
    await publishEvent(ctx, {
      type: "emergency.escalated",
      dedupeKey: `emergency.escalated:${args.emergencyId}`,
      data: { emergencyId: args.emergencyId },
    });
    return null;
  },
});

export const recordNotification = internalMutation({
  args: { emergencyId: v.id("emergencies"), reason: reasonValidator },
  handler: async (ctx, args): Promise<null> => {
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency || emergency.notifiedAt) {
      return null;
    }
    await ctx.db.patch(args.emergencyId, {
      notifiedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deliverNotification = internalAction({
  args: { emergencyId: v.id("emergencies"), reason: reasonValidator },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.emergency.recordNotification, {
      emergencyId: args.emergencyId,
      reason: args.reason,
    });
    return null;
  },
});

export const addNote = mutation({
  args: {
    emergencyId: v.id("emergencies"),
    text: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    const trimmed = args.text.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      throw new ConvexError({ code: "INVALID_NOTE" });
    }
    let author: string;
    let authorKind: "traveller" | "operator";
    if (args.sessionId && args.sessionId === emergency.sessionId) {
      author = `session:${args.sessionId}`;
      authorKind = "traveller";
    } else {
      author = await requireOps(ctx);
      authorKind = "operator";
    }
    await ctx.db.insert("emergencyNotes", {
      emergencyId: args.emergencyId,
      author,
      authorKind,
      text: trimmed,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.emergencyId, { updatedAt: Date.now() });
    return { added: true, authorKind };
  },
});

export const notesFor = query({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emergencyNotes")
      .withIndex("by_emergency", (q) => q.eq("emergencyId", args.emergencyId))
      .order("desc")
      .take(50);
  },
});

export const assign = mutation({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    const operator = await requireOps(ctx);
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    await ctx.db.patch(args.emergencyId, {
      assignedTo: operator,
      updatedAt: Date.now(),
    });
    return { assignedTo: operator };
  },
});

export const reopen = mutation({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      throw new ConvexError({ code: "EMERGENCY_NOT_FOUND" });
    }
    if (emergency.status !== "resolved" && emergency.status !== "cancelled") {
      return { status: emergency.status };
    }
    const now = Date.now();
    await ctx.db.patch(args.emergencyId, {
      status: "raised",
      reopenedAt: now,
      updatedAt: now,
    });
    await publishEvent(ctx, {
      type: "emergency.raised",
      dedupeKey: `emergency.reopened:${args.emergencyId}:${now}`,
      data: { emergencyId: args.emergencyId },
    });
    await ctx.runMutation(internal.workflows.startEmergencyEscalation, {
      emergencyId: args.emergencyId,
      windowMs: ESCALATION_WINDOW_MS,
    });
    return { status: "raised" as const };
  },
});

export const history = query({
  args: { sessionId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emergencies")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const recent = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    return await ctx.db
      .query("emergencies")
      .withIndex("by_created_at")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const cap = 100;
    const statuses = ["raised", "escalated", "acknowledged", "resolved"] as const;
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const rows = await ctx.db
        .query("emergencies")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(cap);
      counts[status] = rows.length;
    }
    return counts;
  },
});

export const assignedToMe = query({
  args: {},
  handler: async (ctx) => {
    const operator = await requireOps(ctx);
    const recentRows = await ctx.db
      .query("emergencies")
      .withIndex("by_created_at")
      .order("desc")
      .take(100);
    return recentRows.filter(
      (e) =>
        e.assignedTo === operator &&
        e.status !== "resolved" &&
        e.status !== "cancelled",
    );
  },
});

export const timeline = query({
  args: { emergencyId: v.id("emergencies") },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const emergency = await ctx.db.get(args.emergencyId);
    if (!emergency) {
      return null;
    }
    const notes = await ctx.db
      .query("emergencyNotes")
      .withIndex("by_emergency", (q) => q.eq("emergencyId", args.emergencyId))
      .order("desc")
      .take(50);
    return { emergency, notes };
  },
});
