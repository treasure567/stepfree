import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { calculateTransitRoute } from "./lib/transit";
import { rateLimiter } from "./lib/rateLimits";
import { requireOps } from "./lib/auth";

const alertStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("failed"),
);
import { validateEmail, validateSessionId } from "./lib/validation";
import { buildRouteAlertEmail } from "./providers/agentmail";

function routeViaSummary(stations: Array<{ name: string }>) {
  const middle = stations.slice(1, -1).map((station) => station.name);
  return middle.length > 0
    ? middle.join(", ")
    : stations.map((station) => station.name).join(", ");
}

export const evaluateStation = internalMutation({
  args: { stationId: v.id("stations") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("watchStations")
      .withIndex("by_station", (q) => q.eq("stationId", args.stationId))
      .collect();
    const station = await ctx.db.get(args.stationId);
    const affectedStation = station?.name ?? "A station";
    let enqueued = 0;

    for (const link of links) {
      const watch = await ctx.db.get(link.watchId);

      if (!watch || watch.status !== "active") {
        continue;
      }

      const route = await calculateTransitRoute(
        ctx,
        watch.fromSlug,
        watch.toSlug,
      );

      if (route.status !== "ready" && route.status !== "blocked") {
        continue;
      }

      const newFingerprint = route.fingerprint;

      if (newFingerprint === watch.lastNotifiedFingerprint) {
        continue;
      }

      const idempotencyKey = `watch:${watch._id}:${newFingerprint}`;
      const duplicate = await ctx.db
        .query("alerts")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", idempotencyKey),
        )
        .unique();

      if (duplicate) {
        await ctx.db.patch(watch._id, {
          lastNotifiedFingerprint: newFingerprint,
          updatedAt: Date.now(),
        });
        continue;
      }

      const reason =
        newFingerprint === watch.baselineFingerprint
          ? ("restored" as const)
          : route.status === "blocked"
            ? ("blocked" as const)
            : ("rerouted" as const);
      const perWatch = await rateLimiter.limit(ctx, "alertPerWatch", {
        key: watch._id,
      });
      const global = await rateLimiter.limit(ctx, "alertGlobal");

      if (!perWatch.ok || !global.ok) {
        continue;
      }

      const now = Date.now();
      const alertId = await ctx.db.insert("alerts", {
        channel: "watch",
        watchId: watch._id,
        userId: watch.userId,
        email: watch.email,
        emailNormalized: watch.emailNormalized,
        reason,
        fromSlug: watch.fromSlug,
        toSlug: watch.toSlug,
        fromName: route.fromName,
        toName: route.toName,
        incidentTitle: affectedStation,
        durationAfter:
          route.status === "ready" ? route.durationMinutes : undefined,
        delayMinutes: route.status === "ready" ? route.delayMinutes : undefined,
        routeVia:
          route.status === "ready" ? routeViaSummary(route.stations) : undefined,
        idempotencyKey,
        status: "queued",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(watch._id, {
        lastNotifiedFingerprint: newFingerprint,
        lastRerouted: reason !== "restored",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.alerts.deliverAlert, {
        alertId,
      });
      enqueued += 1;
    }

    return { enqueued, watchesChecked: links.length };
  },
});

export const requestDrillAlert = mutation({
  args: {
    sessionId: v.string(),
    email: v.optional(v.string()),
    fromSlug: v.optional(v.string()),
    toSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    await rateLimiter.limit(ctx, "drillAlertPerSession", {
      key: sessionId,
      throws: true,
    });

    const recipient = args.email
      ? validateEmail(args.email)
      : (process.env.AGENTMAIL_INBOX_ID ?? "").trim();

    if (!recipient) {
      throw new ConvexError({ code: "NO_RECIPIENT" });
    }

    const fromSlug = args.fromSlug?.trim() || "waterloo";
    const toSlug = args.toSlug?.trim() || "barbican";
    const route = await calculateTransitRoute(ctx, fromSlug, toSlug, {
      sessionId,
    });

    if (route.status !== "ready" && route.status !== "blocked") {
      throw new ConvexError({
        code: "ROUTE_NOT_ALERTABLE",
        status: route.status,
      });
    }

    if (route.status === "ready" && !route.rerouted) {
      throw new ConvexError({ code: "NO_ACTIVE_REROUTE" });
    }

    const reason =
      route.status === "blocked" ? ("blocked" as const) : ("rerouted" as const);
    const idempotencyKey = `drill:${sessionId}:${route.fingerprint}`;
    const duplicate = await ctx.db
      .query("alerts")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();

    if (duplicate) {
      return {
        alertId: duplicate._id,
        created: false,
        status: duplicate.status,
      };
    }

    const now = Date.now();
    const alertId = await ctx.db.insert("alerts", {
      channel: "drill",
      sessionId,
      email: recipient,
      emailNormalized: recipient.toLowerCase(),
      reason,
      fromSlug,
      toSlug,
      fromName: route.fromName,
      toName: route.toName,
      incidentTitle: "Bond Street",
      durationAfter:
        route.status === "ready" ? route.durationMinutes : undefined,
      delayMinutes: route.status === "ready" ? route.delayMinutes : undefined,
      routeVia:
        route.status === "ready" ? routeViaSummary(route.stations) : undefined,
      idempotencyKey,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.alerts.deliverAlert, { alertId });

    return { alertId, created: true, status: "queued" as const };
  },
});

export const deliverAlert = internalAction({
  args: { alertId: v.id("alerts") },
  handler: async (
    ctx,
    args,
  ): Promise<
    { skipped: true } | { sent: true; providerMessageId: string }
  > => {
    const claimed = await ctx.runMutation(internal.alerts.markSending, {
      alertId: args.alertId,
    });

    if (!claimed.claimed) {
      return { skipped: true };
    }

    try {
      const email = buildRouteAlertEmail({
        fromName: claimed.fromName,
        toName: claimed.toName,
        reason: claimed.reason,
        affectedStation: claimed.incidentTitle,
        routeVia: claimed.routeVia,
        durationAfter: claimed.durationAfter,
        delayMinutes: claimed.delayMinutes,
      });
      const result: { messageId: string } = await ctx.runAction(
        internal.emailSend.deliver,
        {
          to: claimed.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
          idempotencyKey: claimed.idempotencyKey,
        },
      );
      await ctx.runMutation(internal.alerts.markSent, {
        alertId: args.alertId,
        providerMessageId: result.messageId,
      });
      return { sent: true, providerMessageId: result.messageId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AgentMail send failed";
      await ctx.runMutation(internal.alerts.markFailed, {
        alertId: args.alertId,
        error: message,
      });
      throw error;
    }
  },
});

type MarkSendingResult =
  | { claimed: false }
  | {
      claimed: true;
      email: string;
      fromName: string;
      toName: string;
      reason: "rerouted" | "blocked" | "restored";
      incidentTitle?: string;
      routeVia?: string;
      durationAfter?: number;
      delayMinutes?: number;
      idempotencyKey: string;
    };

export const markSending = internalMutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args): Promise<MarkSendingResult> => {
    const alert = await ctx.db.get(args.alertId);

    if (!alert || alert.status !== "queued") {
      return { claimed: false as const };
    }

    await ctx.db.patch(args.alertId, {
      status: "sending",
      attempts: alert.attempts + 1,
      updatedAt: Date.now(),
    });

    return {
      claimed: true as const,
      email: alert.email,
      fromName: alert.fromName,
      toName: alert.toName,
      reason: alert.reason,
      incidentTitle: alert.incidentTitle,
      routeVia: alert.routeVia,
      durationAfter: alert.durationAfter,
      delayMinutes: alert.delayMinutes,
      idempotencyKey: alert.idempotencyKey,
    };
  },
});

export const markSent = internalMutation({
  args: {
    alertId: v.id("alerts"),
    providerMessageId: v.string(),
    providerThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.alertId, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      sentAt: now,
      updatedAt: now,
      error: undefined,
    });
    return { ok: true };
  },
});

export const markFailed = internalMutation({
  args: { alertId: v.id("alerts"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      status: "failed",
      error: args.error.slice(0, 300),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const getAlert = internalQuery({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => ctx.db.get(args.alertId),
});

export const drillAlerts = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const sessionId = validateSessionId(args.sessionId);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("desc")
      .take(10);

    return alerts.map((alert) => ({
      id: alert._id,
      reason: alert.reason,
      status: alert.status,
      recipientMasked: maskRecipient(alert.email),
      providerMessageId: alert.providerMessageId ?? null,
      durationAfter: alert.durationAfter ?? null,
      delayMinutes: alert.delayMinutes ?? null,
      routeVia: alert.routeVia ?? null,
      createdAt: alert.createdAt,
      sentAt: alert.sentAt ?? null,
      deliveredAt: alert.deliveredAt ?? null,
    }));
  },
});

function maskRecipient(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) {
    return `${email.slice(0, 2)}…`;
  }
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export const retryFailed = action({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const requeued = await ctx.runMutation(internal.alerts.requeue, {
      alertId: args.alertId,
    });

    if (!requeued.requeued) {
      return { requeued: false };
    }

    await ctx.runAction(internal.alerts.deliverAlert, { alertId: args.alertId });
    return { requeued: true };
  },
});

export const requeue = internalMutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);

    if (!alert || alert.status !== "failed") {
      return { requeued: false as const };
    }

    await ctx.db.patch(args.alertId, { status: "queued", updatedAt: Date.now() });
    return { requeued: true as const };
  },
});

export const byStatus = query({
  args: { status: alertStatusValidator, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOps(ctx);
    const limit = Math.min(args.limit ?? 30, 100);
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
    return rows.map((alert) => ({
      _id: alert._id,
      status: alert.status,
      reason: alert.reason,
      recipientMasked: `${alert.email.slice(0, 1)}•••@${alert.email.split("@")[1] ?? ""}`,
      fromName: alert.fromName,
      toName: alert.toName,
      providerMessageId: alert.providerMessageId ?? null,
      attempts: alert.attempts,
      updatedAt: alert.updatedAt,
    }));
  },
});

export const opsStats = query({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const cap = 100;
    const statuses = [
      "queued",
      "sending",
      "sent",
      "delivered",
      "bounced",
      "failed",
    ] as const;
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const rows = await ctx.db
        .query("alerts")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(cap);
      counts[status] = rows.length;
    }
    return counts;
  },
});
