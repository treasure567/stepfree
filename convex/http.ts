import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { registerStaticPageRoutes } from "./lib/staticPages";
import { verifyHmacSignature } from "./lib/webhookAuth";
import { readSvixHeaders, verifySvixSignature } from "./lib/svix";

const http = httpRouter();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stringField(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractEmail(value: unknown): string | null {
  if (typeof value === "string") {
    return value.includes("@") ? value : null;
  }
  const obj = asObject(value);
  if (obj) {
    return asString(pick(obj, "email", "address"));
  }
  if (Array.isArray(value) && value.length > 0) {
    return extractEmail(value[0]);
  }
  return null;
}

type VerifiedBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

async function readVerified(req: Request, secretName: string): Promise<VerifiedBody> {
  const raw = await req.text();
  const signature =
    req.headers.get("x-webhook-signature") ?? req.headers.get("x-signature");
  const secret = process.env[secretName] ?? "";
  const valid = await verifyHmacSignature({ secret, payload: raw, signature });
  if (!valid) {
    return { ok: false, response: new Response("invalid signature", { status: 401 }) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: new Response("invalid json", { status: 400 }) };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, response: new Response("invalid body", { status: 400 }) };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return jsonResponse({ status: "ok", time: Date.now() });
  }),
});

http.route({
  path: "/webhooks/agentmail",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    const svix = readSvixHeaders(req.headers);
    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET ?? "";
    const valid = await verifySvixSignature({ secret, payload: raw, headers: svix });
    if (!valid) {
      return new Response("invalid signature", { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("not an object");
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const eventType = (
      asString(pick(body, "type", "event", "event_type")) ?? "unknown"
    ).toLowerCase();
    const message = asObject(pick(body, "message", "data")) ?? body;
    const eventId = asString(pick(body, "id", "eventId")) ?? svix.id!;
    const providerMessageId =
      asString(pick(message, "message_id", "messageId", "id")) ?? eventId;
    const payload = JSON.stringify(body);

    if (eventType.includes("received") || eventType.includes("inbound")) {
      const fromEmail = extractEmail(
        pick(message, "from", "from_email", "fromEmail", "sender"),
      );
      if (!fromEmail) {
        return new Response("missing sender", { status: 400 });
      }
      const result = await ctx.runMutation(
        internal.webhooks.ingestAgentmailInbound,
        {
          eventId,
          providerMessageId,
          fromEmail,
          subject: asString(pick(message, "subject")) ?? undefined,
          text: asString(pick(message, "text", "body", "preview")) ?? undefined,
          threadId:
            asString(pick(message, "thread_id", "threadId")) ?? undefined,
          payload,
        },
      );
      return jsonResponse({ ok: true, type: eventType, ...result });
    }

    if (
      eventType.includes("delivered") ||
      eventType.includes("bounce")
    ) {
      const outcome = eventType.includes("bounce") ? "bounced" : "delivered";
      const result = await ctx.runMutation(
        internal.webhooks.ingestAgentmailDelivery,
        { eventId, providerMessageId, outcome, payload },
      );
      return jsonResponse({ ok: true, type: eventType, ...result });
    }

    const result = await ctx.runMutation(internal.webhooks.ingestAgentmailEvent, {
      eventId,
      eventType,
      payload,
    });
    return jsonResponse({ ok: true, type: eventType, ...result });
  }),
});

http.route({
  path: "/webhooks/partner/lift-status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const check = await readVerified(req, "PARTNER_WEBHOOK_SECRET");
    if (!check.ok) {
      return check.response;
    }
    const eventId = stringField(check.body, "eventId", "id");
    const stationSlug = stringField(check.body, "stationSlug", "station");
    const rawStatus = stringField(check.body, "status");
    const status =
      rawStatus === "working"
        ? "working"
        : rawStatus === "out-of-service" || rawStatus === "down"
          ? "out-of-service"
          : null;
    if (!eventId || !stationSlug || !status) {
      return new Response("missing fields", { status: 400 });
    }
    const note = stringField(check.body, "note") ?? undefined;
    const result = await ctx.runMutation(
      internal.webhooks.ingestPartnerLiftStatus,
      { eventId, stationSlug, status, note, payload: JSON.stringify(check.body) },
    );
    return jsonResponse({ ok: true, ...result });
  }),
});

registerStaticPageRoutes(http);
registerStaticRoutes(http, components.staticHosting);

export default http;
