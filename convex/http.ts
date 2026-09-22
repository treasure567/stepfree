import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { registerStaticPageRoutes } from "./lib/staticPages";
import { verifyHmacSignature } from "./lib/webhookAuth";

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
  path: "/webhooks/agentmail/delivery",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const check = await readVerified(req, "AGENTMAIL_WEBHOOK_SECRET");
    if (!check.ok) {
      return check.response;
    }
    const eventId = stringField(check.body, "eventId", "id");
    const providerMessageId = stringField(
      check.body,
      "messageId",
      "providerMessageId",
    );
    const rawOutcome = stringField(check.body, "event", "outcome", "type");
    const outcome =
      rawOutcome === "delivered"
        ? "delivered"
        : rawOutcome === "bounced" || rawOutcome === "bounce"
          ? "bounced"
          : null;
    if (!eventId || !providerMessageId || !outcome) {
      return new Response("missing fields", { status: 400 });
    }
    const result = await ctx.runMutation(
      internal.webhooks.ingestAgentmailDelivery,
      { eventId, providerMessageId, outcome, payload: JSON.stringify(check.body) },
    );
    return jsonResponse({ ok: true, ...result });
  }),
});

http.route({
  path: "/webhooks/agentmail/inbound",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const check = await readVerified(req, "AGENTMAIL_WEBHOOK_SECRET");
    if (!check.ok) {
      return check.response;
    }
    const eventId = stringField(check.body, "eventId", "id");
    const providerMessageId = stringField(
      check.body,
      "messageId",
      "providerMessageId",
    );
    const fromEmail = stringField(check.body, "from", "fromEmail");
    if (!eventId || !providerMessageId || !fromEmail) {
      return new Response("missing fields", { status: 400 });
    }
    const subject = stringField(check.body, "subject") ?? undefined;
    const text = stringField(check.body, "text", "body") ?? undefined;
    const threadId = stringField(check.body, "threadId") ?? undefined;
    const result = await ctx.runMutation(
      internal.webhooks.ingestAgentmailInbound,
      {
        eventId,
        providerMessageId,
        fromEmail,
        subject,
        text,
        threadId,
        payload: JSON.stringify(check.body),
      },
    );
    return jsonResponse({ ok: true, ...result });
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
