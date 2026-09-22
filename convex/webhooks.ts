import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { publishEvent } from "./events";
import { logActivity } from "./activity";

type ReceiptOutcome = "accepted" | "duplicate";

type ReceiptDetails = {
  payload?: string;
  eventType?: string;
  summary?: string;
};

function providerForSource(source: string): "agentmail" | "system" {
  return source.startsWith("agentmail") ? "agentmail" : "system";
}

async function recordReceipt(
  ctx: MutationCtx,
  source: string,
  eventId: string,
  signatureValid: boolean,
  details: ReceiptDetails = {},
): Promise<ReceiptOutcome> {
  const prior = await ctx.db
    .query("webhookReceipts")
    .withIndex("by_source_and_event", (q) =>
      q.eq("source", source).eq("eventId", eventId),
    )
    .first();
  if (prior && prior.status === "accepted") {
    await ctx.db.insert("webhookReceipts", {
      source,
      eventId,
      signatureValid,
      status: "duplicate",
      receivedAt: Date.now(),
      ...(details.eventType ? { eventType: details.eventType } : {}),
      ...(details.summary ? { summary: details.summary } : {}),
      ...(details.payload ? { payload: details.payload } : {}),
    });
    await logActivity(ctx, {
      action: "webhook.duplicate",
      provider: providerForSource(source),
      level: "warn",
      summary: `Duplicate ${source} webhook ignored (${eventId})`,
      targetKind: "webhookReceipt",
      targetId: eventId,
    });
    return "duplicate";
  }
  await ctx.db.insert("webhookReceipts", {
    source,
    eventId,
    signatureValid,
    status: "accepted",
    receivedAt: Date.now(),
    ...(details.eventType ? { eventType: details.eventType } : {}),
    ...(details.summary ? { summary: details.summary } : {}),
    ...(details.payload ? { payload: details.payload } : {}),
  });
  await publishEvent(ctx, {
    type: "webhook.received",
    dedupeKey: `webhook:${source}:${eventId}`,
    data: { source, eventId },
  });
  await logActivity(ctx, {
    action: "webhook.received",
    provider: providerForSource(source),
    level: "success",
    summary: details.summary ?? `Received ${source} webhook`,
    targetKind: "webhookReceipt",
    targetId: eventId,
    metadata: details.eventType ? { eventType: details.eventType } : undefined,
  });
  return "accepted";
}

function parseIntent(
  text: string | undefined,
): "arrived" | "still-stuck" | "pause" | "unknown" {
  const value = (text ?? "").toLowerCase();
  if (/(arrived|made it|i'?m here|got there|all good)/.test(value)) {
    return "arrived";
  }
  if (/(trapped|still stuck|still broken|not working|help)/.test(value)) {
    return "still-stuck";
  }
  if (/(pause|unsubscribe|mute|stop alerts)/.test(value)) {
    return "pause";
  }
  return "unknown";
}

export const ingestAgentmailDelivery = internalMutation({
  args: {
    eventId: v.string(),
    providerMessageId: v.string(),
    outcome: v.union(v.literal("delivered"), v.literal("bounced")),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outcome = await recordReceipt(ctx, "agentmail-delivery", args.eventId, true, {
      payload: args.payload,
      eventType: args.outcome,
      summary: `AgentMail ${args.outcome} · ${args.providerMessageId}`,
    });
    if (outcome === "duplicate") {
      return { duplicate: true, applied: false };
    }
    const alert = await ctx.db
      .query("alerts")
      .withIndex("by_provider_message", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .first();
    if (!alert || alert.status === "delivered" || alert.status === "bounced") {
      return { duplicate: false, applied: false };
    }
    const now = Date.now();
    await ctx.db.patch(alert._id, {
      status: args.outcome,
      updatedAt: now,
      ...(args.outcome === "delivered" ? { deliveredAt: now } : {}),
    });
    return { duplicate: false, applied: true };
  },
});

export const ingestAgentmailInbound = internalMutation({
  args: {
    eventId: v.string(),
    providerMessageId: v.string(),
    fromEmail: v.string(),
    subject: v.optional(v.string()),
    text: v.optional(v.string()),
    threadId: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outcome = await recordReceipt(ctx, "agentmail-inbound", args.eventId, true, {
      payload: args.payload,
      eventType: "inbound",
      summary: `Inbound reply from ${args.fromEmail}`,
    });
    if (outcome === "duplicate") {
      return { duplicate: true };
    }
    const fromNormalized = args.fromEmail.trim().toLowerCase();
    const intent = parseIntent(args.text ?? args.subject);
    const watch = await ctx.db
      .query("routeWatches")
      .withIndex("by_email_normalized", (q) =>
        q.eq("emailNormalized", fromNormalized),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    await ctx.db.insert("inboundMessages", {
      source: "agentmail",
      providerMessageId: args.providerMessageId,
      fromEmail: args.fromEmail,
      fromNormalized,
      parsedIntent: intent,
      idempotencyKey: args.eventId,
      receivedAt: Date.now(),
      ...(args.subject ? { subject: args.subject } : {}),
      ...(args.text ? { text: args.text } : {}),
      ...(args.threadId ? { threadId: args.threadId } : {}),
      ...(watch ? { watchId: watch._id } : {}),
    });

    if (watch && intent === "pause") {
      await ctx.db.patch(watch._id, { status: "paused", updatedAt: Date.now() });
    }
    await logActivity(ctx, {
      action: "inbound.parsed",
      provider: "agentmail",
      level: "info",
      summary: `Reply parsed as "${intent}" from ${args.fromEmail}${
        watch ? " (matched an active watch)" : ""
      }`,
      targetKind: "inboundMessage",
      targetId: args.providerMessageId,
      metadata: { intent, matchedWatch: watch !== null },
    });
    return { duplicate: false, matchedWatch: watch !== null, intent };
  },
});

export const ingestPartnerLiftStatus = internalMutation({
  args: {
    eventId: v.string(),
    stationSlug: v.string(),
    status: v.union(v.literal("working"), v.literal("out-of-service")),
    note: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outcome = await recordReceipt(ctx, "partner-lift", args.eventId, true, {
      payload: args.payload,
      eventType: args.status,
      summary: `Partner lift ${args.status} · ${args.stationSlug}`,
    });
    if (outcome === "duplicate") {
      return { duplicate: true, recorded: false };
    }
    const station = await ctx.db
      .query("stations")
      .withIndex("by_slug", (q) => q.eq("slug", args.stationSlug))
      .unique();
    if (!station) {
      return { duplicate: false, recorded: false };
    }
    await ctx.db.insert("reports", {
      stationId: station._id,
      sessionId: `partner:${args.eventId}`,
      observation: args.status === "working" ? "working" : "not-working",
      reviewStatus: "pending",
      idempotencyKey: args.eventId,
      createdAt: Date.now(),
      ...(args.note ? { note: args.note } : {}),
    });
    return { duplicate: false, recorded: true };
  },
});

async function requireOps(ctx: QueryCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({ code: "UNAUTHORIZED_OPS" });
  }
  return userId as string;
}

export const receipts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db
      .query("webhookReceipts")
      .withIndex("by_received_at")
      .order("desc")
      .take(limit);
  },
});

export const recentInbound = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db.query("inboundMessages").order("desc").take(limit);
  },
});

export const receiptsForSource = query({
  args: { source: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    return await ctx.db
      .query("webhookReceipts")
      .withIndex("by_source_and_event", (q) => q.eq("source", args.source))
      .order("desc")
      .take(limit);
  },
});
