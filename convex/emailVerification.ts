import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { createNumericCode, hashVerificationCode } from "./lib/crypto";
import { rateLimiter } from "./lib/rateLimits";
import {
  normalizeEmail,
  validateEmail,
  validateIdempotencyKey,
} from "./lib/validation";
import { buildVerificationEmail } from "./providers/agentmail";

const verificationLifetime = 10 * 60 * 1_000;

type RequestResult = {
  status: "sent" | "already-verified" | "deduplicated";
  email: string;
  expiresAt?: number;
};

type ExistingRequest = {
  status: "pending" | "sent" | "verified" | "failed";
  email: string;
  expiresAt: number;
};

export const findRequest = internalQuery({
  args: {
    userId: v.id("users"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<ExistingRequest | null> => {
    const request = await ctx.db
      .query("emailVerifications")
      .withIndex("by_idempotency", (query) =>
        query.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();

    if (!request || request.userId !== args.userId) {
      return null;
    }

    return {
      status: request.status,
      email: request.email,
      expiresAt: request.expiresAt,
    };
  },
});

export const prepareRequest = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    emailNormalized: v.string(),
    codeHash: v.string(),
    idempotencyKey: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new ConvexError({ code: "ACCOUNT_NOT_FOUND" });
    }

    const existingRequest = await ctx.db
      .query("emailVerifications")
      .withIndex("by_idempotency", (query) =>
        query.eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();

    if (existingRequest) {
      if (existingRequest.userId !== args.userId) {
        throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT" });
      }

      return {
        status: "deduplicated" as const,
        displayName: user.displayName,
        email: existingRequest.email,
        expiresAt: existingRequest.expiresAt,
      };
    }

    if (
      user.emailNormalized === args.emailNormalized &&
      user.emailVerifiedAt !== undefined
    ) {
      return {
        status: "already-verified" as const,
        displayName: user.displayName,
      };
    }

    const emailOwner = await ctx.db
      .query("users")
      .withIndex("by_email", (query) =>
        query.eq("emailNormalized", args.emailNormalized),
      )
      .unique();

    if (emailOwner && emailOwner._id !== args.userId) {
      throw new ConvexError({ code: "EMAIL_IN_USE" });
    }

    const activeRequests = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user", (query) => query.eq("userId", args.userId))
      .order("desc")
      .take(10);
    const now = Date.now();

    for (const request of activeRequests) {
      if (request.status === "pending" || request.status === "sent") {
        await ctx.db.patch(request._id, {
          status: "failed",
          failureCode: "superseded",
        });
      }
    }

    const requestId = await ctx.db.insert("emailVerifications", {
      userId: args.userId,
      email: args.email,
      emailNormalized: args.emailNormalized,
      codeHash: args.codeHash,
      status: "pending",
      attempts: 0,
      expiresAt: args.expiresAt,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });
    await ctx.db.patch(args.userId, {
      pendingEmail: args.email,
      updatedAt: now,
    });

    return {
      status: "created" as const,
      requestId,
      displayName: user.displayName,
    };
  },
});

export const markSent = internalMutation({
  args: {
    requestId: v.id("emailVerifications"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);

    if (
      !request ||
      request.userId !== args.userId ||
      request.status !== "pending"
    ) {
      return false;
    }

    await ctx.db.patch(request._id, {
      status: "sent",
      sentAt: Date.now(),
    });
    return true;
  },
});

export const markFailed = internalMutation({
  args: {
    requestId: v.id("emailVerifications"),
    userId: v.id("users"),
    failureCode: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);

    if (
      !request ||
      request.userId !== args.userId ||
      request.status !== "pending"
    ) {
      return false;
    }

    await ctx.db.patch(request._id, {
      status: "failed",
      failureCode: args.failureCode,
    });
    const user = await ctx.db.get(args.userId);

    if (
      user?.pendingEmail &&
      normalizeEmail(user.pendingEmail) === request.emailNormalized
    ) {
      await ctx.db.patch(args.userId, {
        pendingEmail: undefined,
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});

export const request = action({
  args: {
    email: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("sent"),
      v.literal("already-verified"),
      v.literal("deduplicated"),
    ),
    email: v.string(),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<RequestResult> => {
    const authUserId = await getAuthUserId(ctx);

    if (!authUserId) {
      throw new ConvexError({ code: "AUTH_REQUIRED" });
    }

    const userId = authUserId as Id<"users">;
    const email = args.email.trim();
    const emailNormalized = validateEmail(email);
    const idempotencyKey = validateIdempotencyKey(args.idempotencyKey);
    const existing: ExistingRequest | null = await ctx.runQuery(
      internal.emailVerification.findRequest,
      {
        userId,
        idempotencyKey,
      },
    );

    if (existing) {
      return {
        status: "deduplicated" as const,
        email: existing.email,
        expiresAt: existing.expiresAt,
      };
    }

    await Promise.all([
      rateLimiter.limit(ctx, "emailVerificationPerUser", {
        key: userId,
        throws: true,
      }),
      rateLimiter.limit(ctx, "emailVerificationGlobal", { throws: true }),
    ]);

    const code = createNumericCode();
    const codeHash = await hashVerificationCode(idempotencyKey, code);
    const expiresAt = Date.now() + verificationLifetime;
    const prepared = await ctx.runMutation(
      internal.emailVerification.prepareRequest,
      {
        userId,
        email,
        emailNormalized,
        codeHash,
        idempotencyKey,
        expiresAt,
      },
    );

    if (prepared.status === "already-verified") {
      return { status: "already-verified" as const, email };
    }

    if (prepared.status === "deduplicated") {
      return {
        status: "deduplicated" as const,
        email: prepared.email,
        expiresAt: prepared.expiresAt,
      };
    }

    try {
      const message = buildVerificationEmail({
        code,
        displayName: prepared.displayName,
      });
      await ctx.runAction(internal.emailSend.deliver, {
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await ctx.runMutation(internal.emailVerification.markSent, {
        requestId: prepared.requestId,
        userId,
      });
      return { status: "sent" as const, email, expiresAt };
    } catch {
      await ctx.runMutation(internal.emailVerification.markFailed, {
        requestId: prepared.requestId,
        userId,
        failureCode: "delivery-failed",
      });
      throw new ConvexError({ code: "EMAIL_DELIVERY_FAILED" });
    }
  },
});

export const verify = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  returns: v.union(
    v.object({ success: v.literal(true), email: v.string() }),
    v.object({
      success: v.literal(false),
      error: v.union(
        v.literal("CODE_INVALID"),
        v.literal("CODE_EXPIRED"),
        v.literal("CODE_LOCKED"),
        v.literal("REQUEST_NOT_FOUND"),
        v.literal("RATE_LIMITED"),
      ),
      retryAfterMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);

    if (!authUserId) {
      throw new ConvexError({ code: "AUTH_REQUIRED" });
    }

    const userId = authUserId as Id<"users">;
    const emailNormalized = normalizeEmail(args.email);
    const rateLimit = await rateLimiter.limit(ctx, "emailCodeAttempt", {
      key: userId,
    });

    if (!rateLimit.ok) {
      return {
        success: false as const,
        error: "RATE_LIMITED" as const,
        retryAfterMs: rateLimit.retryAfter,
      };
    }

    const request = await ctx.db
      .query("emailVerifications")
      .withIndex("by_user_email", (query) =>
        query.eq("userId", userId).eq("emailNormalized", emailNormalized),
      )
      .order("desc")
      .first();

    if (!request || request.status !== "sent") {
      return { success: false as const, error: "REQUEST_NOT_FOUND" as const };
    }

    if (request.attempts >= 5) {
      return { success: false as const, error: "CODE_LOCKED" as const };
    }

    if (request.expiresAt < Date.now()) {
      await ctx.db.patch(request._id, {
        status: "failed",
        failureCode: "expired",
      });
      return { success: false as const, error: "CODE_EXPIRED" as const };
    }

    const codeHash = await hashVerificationCode(
      request.idempotencyKey,
      args.code.trim(),
    );

    if (codeHash !== request.codeHash) {
      const attempts = request.attempts + 1;
      await ctx.db.patch(request._id, {
        attempts,
        status: attempts >= 5 ? "failed" : "sent",
        failureCode: attempts >= 5 ? "attempts-exhausted" : undefined,
      });
      return {
        success: false as const,
        error: attempts >= 5 ? "CODE_LOCKED" as const : "CODE_INVALID" as const,
      };
    }

    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (query) =>
        query.eq("emailNormalized", request.emailNormalized),
      )
      .unique();

    if (owner && owner._id !== userId) {
      throw new ConvexError({ code: "EMAIL_IN_USE" });
    }

    const verifiedAt = Date.now();
    await Promise.all([
      ctx.db.patch(userId, {
        email: request.email,
        emailNormalized: request.emailNormalized,
        emailVerifiedAt: verifiedAt,
        pendingEmail: undefined,
        updatedAt: verifiedAt,
      }),
      ctx.db.patch(request._id, {
        status: "verified",
        verifiedAt,
      }),
    ]);

    return { success: true as const, email: request.email };
  },
});
