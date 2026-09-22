import { v } from "convex/values";
import { internalAction } from "./_generated/server";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function maskAddress(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) {
    return `${value.slice(0, 3)}…`;
  }
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export const testAgentMailSend = internalAction({
  args: {
    to: v.optional(v.string()),
    withIdempotencyKey: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiKey = requiredEnv("AGENTMAIL_API_KEY");
    const inboxId = requiredEnv("AGENTMAIL_INBOX_ID");
    const to = args.to?.trim() || inboxId;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    if (args.withIdempotencyKey) {
      headers["Idempotency-Key"] = "stepfree-send-test-key";
    }

    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          to,
          subject: "StepFree send test",
          text: "StepFree send test.",
        }),
      },
    );

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = (await response.text()).slice(0, 400);
    }

    return { status: response.status, ok: response.ok, to, body };
  },
});

export const checkAgentMail = internalAction({
  args: {},
  handler: async () => {
    const apiKey = requiredEnv("AGENTMAIL_API_KEY");
    const inboxId = requiredEnv("AGENTMAIL_INBOX_ID");
    const headers = { Authorization: `Bearer ${apiKey}` };

    const direct = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}`,
      { headers },
    );

    if (direct.ok) {
      const body = (await direct.json()) as {
        inbox_id?: string;
        email_address?: string;
        display_name?: string;
      };
      const address = body.email_address ?? body.inbox_id ?? inboxId;
      return {
        ok: true,
        endpoint: "GET /v0/inboxes/{id}",
        status: direct.status,
        inbox: maskAddress(address),
        displayName: body.display_name ?? null,
      };
    }

    const list = await fetch("https://api.agentmail.to/v0/inboxes", { headers });
    if (list.ok) {
      const body = (await list.json()) as {
        inboxes?: Array<{ inbox_id?: string; email_address?: string }>;
        count?: number;
      };
      const inboxes = body.inboxes ?? [];
      const match = inboxes.find(
        (item) => item.inbox_id === inboxId || item.email_address === inboxId,
      );
      return {
        ok: Boolean(match),
        endpoint: "GET /v0/inboxes",
        status: list.status,
        inboxCount: inboxes.length,
        matchedConfiguredInbox: Boolean(match),
        inbox: match
          ? maskAddress(match.email_address ?? match.inbox_id ?? inboxId)
          : null,
      };
    }

    return {
      ok: false,
      status: direct.status,
      listStatus: list.status,
      error: (await direct.text()).slice(0, 200),
    };
  },
});
