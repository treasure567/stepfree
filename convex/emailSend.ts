"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internalAction } from "./_generated/server";

export const deliver = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ messageId: string }> => {
    const host = process.env.AGENTMAIL_SMTP_HOST?.trim() || "smtp.agentmail.to";
    const port = Number(process.env.AGENTMAIL_SMTP_PORT?.trim() || "465");
    const user =
      process.env.AGENTMAIL_SMTP_USER?.trim() ||
      process.env.AGENTMAIL_INBOX_ID?.trim();
    const pass =
      process.env.AGENTMAIL_SMTP_PASS?.trim() ||
      process.env.AGENTMAIL_API_KEY?.trim();
    if (!user || !pass) {
      throw new Error("AGENTMAIL SMTP credentials are not configured");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `StepFree <${user}>`,
      to: args.to,
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
      ...(args.idempotencyKey
        ? { headers: { "X-Idempotency-Key": args.idempotencyKey } }
        : {}),
    });

    return { messageId: info.messageId };
  },
});
