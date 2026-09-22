import { v } from "convex/values";
import { query } from "./_generated/server";
import { calculateTransitRoute } from "./lib/transit";

export const listStations = query({
  args: {},
  handler: async (ctx) => {
    const stations = await ctx.db
      .query("stations")
      .withIndex("by_city", (index) => index.eq("city", "London"))
      .collect();
    return stations
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((station) => ({
        id: station._id,
        slug: station.slug,
        name: station.name,
        city: station.city,
        latitude: station.latitude,
        longitude: station.longitude,
        lines: station.lines,
        stepFreeAccess: station.stepFreeAccess,
      }));
  },
});

export const plan = query({
  args: {
    fromSlug: v.string(),
    toSlug: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: (ctx, args) =>
    calculateTransitRoute(ctx, args.fromSlug.trim(), args.toSlug.trim(), {
      sessionId: args.sessionId?.trim() || undefined,
    }),
});
