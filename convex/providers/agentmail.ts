function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type BuiltEmail = { subject: string; text: string; html: string };

export function buildVerificationEmail(input: {
  code: string;
  displayName: string;
}): BuiltEmail {
  const safeName = escapeHtml(input.displayName);
  return {
    subject: `${input.code} is your StepFree verification code`,
    text: `Hi ${input.displayName},\n\nYour StepFree verification code is ${input.code}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px;padding:32px"><p>Hi ${safeName},</p><p>Your StepFree verification code is:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${input.code}</p><p>This code expires in 10 minutes.</p><p style="color:#6b7280">If you did not request this code, you can ignore this email.</p></div>`,
  };
}

type RouteAlertInput = {
  fromName: string;
  toName: string;
  reason: "rerouted" | "blocked" | "restored";
  affectedStation?: string;
  routeVia?: string;
  durationAfter?: number;
  delayMinutes?: number;
};

function composeRouteAlert(alert: RouteAlertInput) {
  const journey = `${alert.fromName} to ${alert.toName}`;

  if (alert.reason === "blocked") {
    return {
      subject: `Step-free route alert: ${journey}`,
      headline: "No step-free route right now",
      line: `${alert.affectedStation ?? "A station"} on your ${journey} journey has lost step-free access and there is no verified step-free route right now. We will alert you the moment one opens.`,
    };
  }

  if (alert.reason === "restored") {
    return {
      subject: `Step-free route restored: ${journey}`,
      headline: "Step-free route restored",
      line: `Step-free access via ${alert.affectedStation ?? "the affected station"} is restored. Your ${journey} journey is back to ${alert.durationAfter ?? "the original"} minutes.`,
    };
  }

  const added =
    typeof alert.delayMinutes === "number" && alert.delayMinutes > 0
      ? `, ${alert.delayMinutes} minutes added`
      : "";
  return {
    subject: `Step-free reroute: ${journey}`,
    headline: "Your step-free route changed",
    line: `${alert.affectedStation ?? "A lift"}'s lift is unavailable. Your ${journey} journey now goes via ${alert.routeVia ?? "an alternative route"}. New time: ${alert.durationAfter ?? "updated"} minutes${added}.`,
  };
}

export function buildRouteAlertEmail(alert: RouteAlertInput): BuiltEmail {
  const { subject, headline, line } = composeRouteAlert(alert);
  const footer =
    "StepFree keeps step-free routes honest: every reroute is backed by a verified official source and a human review.";
  return {
    subject,
    text: `${line}\n\n${footer}`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px;padding:32px"><p style="font-size:18px;font-weight:700">${escapeHtml(headline)}</p><p>${escapeHtml(line)}</p><p style="color:#6b7280;font-size:13px">${escapeHtml(footer)}</p></div>`,
  };
}
