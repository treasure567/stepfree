import { getAuthUserId } from "@convex-dev/auth/core";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { mobilityModeValidator } from "./lib/validators";

export const createUser = internalMutation({
  args: {
    provider: v.literal("password"),
    providerAccountId: v.string(),
    profile: v.object({ username: v.string() }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("users", {
      username: args.profile.username,
      displayName: args.profile.username,
      mobilityMode: "wheelchair",
      needsStepFreeToTrain: true,
      avoidsStairs: true,
      prefersFewerChanges: true,
      maxWalkingMinutes: 10,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);

    if (!authUserId) {
      return null;
    }

    return ctx.db.get(authUserId as Id<"users">);
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    mobilityMode: mobilityModeValidator,
    needsStepFreeToTrain: v.boolean(),
    avoidsStairs: v.boolean(),
    prefersFewerChanges: v.boolean(),
    maxWalkingMinutes: v.number(),
    homeStationSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);

    if (!authUserId) {
      throw new Error("Sign in to save accessibility preferences");
    }

    const userId = authUserId as Id<"users">;
    const user = await ctx.db.get(userId);

    if (!user) {
      throw new Error("Account profile not found");
    }

    const displayName = args.displayName.trim();

    if (displayName.length < 2 || displayName.length > 40) {
      throw new Error("Display name must be between 2 and 40 characters");
    }

    if (args.maxWalkingMinutes < 1 || args.maxWalkingMinutes > 60) {
      throw new Error("Walking limit must be between 1 and 60 minutes");
    }

    const homeStationSlug = args.homeStationSlug?.trim() || undefined;

    if (homeStationSlug) {
      const station = await ctx.db
        .query("stations")
        .withIndex("by_slug", (index) => index.eq("slug", homeStationSlug))
        .unique();

      if (!station) {
        throw new Error("Home station was not found");
      }
    }

    await ctx.db.patch(userId, {
      ...args,
      displayName,
      homeStationSlug,
      updatedAt: Date.now(),
    });

    return userId;
  },
});

export const recentJourneys = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);

    if (!authUserId) {
      return [];
    }

    const userId = authUserId as Id<"users">;
    const journeys = await ctx.db
      .query("journeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);

    return Promise.all(
      journeys.map(async (journey) => {
        const [fromStation, toStation] = await Promise.all([
          ctx.db.get(journey.fromStationId),
          ctx.db.get(journey.toStationId),
        ]);
        return {
          id: journey._id,
          fromName: fromStation?.name ?? "Unknown station",
          toName: toStation?.name ?? "Unknown station",
          durationMinutes: journey.durationMinutes,
          status: journey.status,
          updatedAt: journey.updatedAt,
        };
      }),
    );
  },
});
