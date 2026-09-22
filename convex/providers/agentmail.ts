type VerificationEmail = {
  to: string;
  code: string;
  displayName: string;
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendVerificationEmail({
  to,
  code,
  displayName,
}: VerificationEmail) {
  const apiKey = requiredEnvironmentValue("AGENTMAIL_API_KEY");
  const inboxId = requiredEnvironmentValue("AGENTMAIL_INBOX_ID");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const safeName = escapeHtml(displayName);

  try {
    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          subject: `${code} is your StepFree verification code`,
          text: `Hi ${displayName},\n\nYour StepFree verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
          html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px;padding:32px"><p>Hi ${safeName},</p><p>Your StepFree verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes.</p><p style="color:#6b7280">If you did not request this code, you can ignore this email.</p></div>`,
          track_opens: false,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`AgentMail request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      message_id?: string;
      thread_id?: string;
    };

    if (!payload.message_id) {
      throw new Error("AgentMail returned no message identifier");
    }

    return { messageId: payload.message_id, threadId: payload.thread_id };
  } finally {
    clearTimeout(timeout);
  }
}

type RouteAlertEmail = {
  to: string;
  fromName: string;
  toName: string;
  reason: "rerouted" | "blocked" | "restored";
  affectedStation?: string;
  routeVia?: string;
  durationAfter?: number;
  delayMinutes?: number;
  idempotencyKey: string;
};

function composeRouteAlert(alert: RouteAlertEmail) {
  const journey = `${alert.fromName} to ${alert.toName}`;

  if (alert.reason === "blocked") {
    const subject = `Step-free route alert: ${journey}`;
    const line = `${alert.affectedStation ?? "A station"} on your ${journey} journey has lost step-free access and there is no verified step-free route right now. We will alert you the moment one opens.`;
    return { subject, headline: "No step-free route right now", line };
  }

  if (alert.reason === "restored") {
    const subject = `Step-free route restored: ${journey}`;
    const line = `Step-free access via ${alert.affectedStation ?? "the affected station"} is restored. Your ${journey} journey is back to ${alert.durationAfter ?? "the original"} minutes.`;
    return { subject, headline: "Step-free route restored", line };
  }

  const added =
    typeof alert.delayMinutes === "number" && alert.delayMinutes > 0
      ? `, ${alert.delayMinutes} minutes added`
      : "";
  const subject = `Step-free reroute: ${journey}`;
  const line = `${alert.affectedStation ?? "A lift"}'s lift is unavailable. Your ${journey} journey now goes via ${alert.routeVia ?? "an alternative route"}. New time: ${alert.durationAfter ?? "updated"} minutes${added}.`;
  return { subject, headline: "Your step-free route changed", line };
}

export async function sendRouteAlert(alert: RouteAlertEmail) {
  const apiKey = requiredEnvironmentValue("AGENTMAIL_API_KEY");
  const inboxId = requiredEnvironmentValue("AGENTMAIL_INBOX_ID");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const { subject, headline, line } = composeRouteAlert(alert);
  const safeLine = escapeHtml(line);

  try {
    const response = await fetch(
      `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": alert.idempotencyKey,
        },
        body: JSON.stringify({
          to: alert.to,
          subject,
          text: `${line}\n\nStepFree keeps step-free routes honest: every reroute is backed by a verified official source and a human review.`,
          html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px;padding:32px"><p style="font-size:18px;font-weight:700">${escapeHtml(headline)}</p><p>${safeLine}</p><p style="color:#6b7280;font-size:13px">StepFree keeps step-free routes honest: every reroute is backed by a verified official source and a human review.</p></div>`,
          track_opens: false,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`AgentMail request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      message_id?: string;
      thread_id?: string;
    };

    if (!payload.message_id) {
      throw new Error("AgentMail returned no message identifier");
    }

    return { messageId: payload.message_id, threadId: payload.thread_id };
  } finally {
    clearTimeout(timeout);
  }
}
