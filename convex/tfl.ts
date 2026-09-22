import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";

const feedUrl = "https://api.tfl.gov.uk/Disruptions/Lifts/v2";
const sourceName = "Transport for London live lift disruption feed";

const disruptionValidator = v.object({
  stationUniqueId: v.string(),
  disruptedLiftUniqueIds: v.array(v.string()),
  message: v.string(),
});

type LiftDisruption = {
  stationUniqueId: string;
  disruptedLiftUniqueIds: string[];
  message: string;
};

type SyncResult = {
  status: "success";
  itemCount: number;
  matchedCount: number;
  fetchedAt: number;
  completedAt: number;
};

function isLiftDisruption(value: unknown): value is LiftDisruption {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.stationUniqueId === "string" &&
    Array.isArray(candidate.disruptedLiftUniqueIds) &&
    candidate.disruptedLiftUniqueIds.every((id) => typeof id === "string") &&
    typeof candidate.message === "string"
  );
}

function normalizeStationName(value: string) {
  return value
    .toLowerCase()
    .replace(/underground station|station/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function externalIncidentId(disruption: LiftDisruption) {
  return [
    "tfl",
    disruption.stationUniqueId,
    ...[...disruption.disruptedLiftUniqueIds].sort(),
  ].join(":");
}

function classifySeverity(message: string) {
  const hasAlternateAccess = [
    /step[- ]free access is still available/i,
    /use the entrance at/i,
    /exit and enter .* via/i,
    /take a train from .* instead/i,
  ].some((pattern) => pattern.test(message));

  return hasAlternateAccess ? "advisory" as const : "route-blocking" as const;
}

export const syncLiftDisruptions = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    const fetchedAt = Date.now();

    try {
      const response = await fetch(feedUrl, {
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`TfL returned HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error("TfL returned an unexpected response shape");
      }

      const disruptions = payload.filter(isLiftDisruption);

      return await ctx.runMutation(internal.tfl.applyLiftDisruptions, {
        disruptions,
        fetchedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TfL sync error";
      await ctx.runMutation(internal.tfl.recordSyncFailure, {
        fetchedAt,
        error: message,
      });
      throw error;
    }
  },
});

export const applyLiftDisruptions = internalMutation({
  args: {
    disruptions: v.array(disruptionValidator),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const [stations, lifts, activeIncidents] = await Promise.all([
      ctx.db.query("stations").collect(),
      ctx.db.query("lifts").collect(),
      ctx.db
        .query("incidents")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect(),
    ]);
    const tflIncidents = activeIncidents.filter(
      (incident) => incident.sourceName === sourceName,
    );
    const otherIncidents = activeIncidents.filter(
      (incident) => incident.sourceName !== sourceName,
    );
    const matchedStationIds = new Set<string>();
    const seenIncidentIds = new Set<string>();
    let matchedCount = 0;

    for (const disruption of args.disruptions) {
      const messageStationName = normalizeStationName(
        disruption.message.split(":", 1)[0] ?? "",
      );
      const station = stations.find(
        (candidate) =>
          candidate.externalIds?.includes(disruption.stationUniqueId) ||
          normalizeStationName(candidate.name) === messageStationName,
      );

      if (!station) {
        continue;
      }

      matchedCount += 1;
      matchedStationIds.add(station._id);
      const externalId = externalIncidentId(disruption);
      const severity = classifySeverity(disruption.message);
      seenIncidentIds.add(externalId);
      const existingIncident = tflIncidents.find(
        (incident) => incident.externalId === externalId,
      );

      if (existingIncident) {
        await ctx.db.patch(existingIncident._id, {
          description: disruption.message,
          externalLiftIds: disruption.disruptedLiftUniqueIds,
          severity,
          updatedAt: args.fetchedAt,
        });
      } else {
        await ctx.db.insert("incidents", {
          stationId: station._id,
          kind: "lift-outage",
          status: "active",
          severity,
          title: `${station.name} lift disruption`,
          description: disruption.message,
          sourceType: "official",
          sourceName,
          sourceUrl: feedUrl,
          confidence: 1,
          externalId,
          externalLiftIds: disruption.disruptedLiftUniqueIds,
          reportedAt: args.fetchedAt,
          updatedAt: args.fetchedAt,
        });
      }
    }

    for (const incident of tflIncidents) {
      if (incident.externalId && !seenIncidentIds.has(incident.externalId)) {
        await ctx.db.patch(incident._id, {
          status: "resolved",
          updatedAt: args.fetchedAt,
          resolvedAt: args.fetchedAt,
        });
      }
    }

    for (const lift of lifts) {
      const hasOfficialDisruption = matchedStationIds.has(lift.stationId);
      const hasOtherDisruption = otherIncidents.some(
        (incident) => incident.stationId === lift.stationId,
      );

      await ctx.db.patch(lift._id, {
        status:
          hasOfficialDisruption || hasOtherDisruption
            ? "out-of-service"
            : "working",
        sourceType: hasOtherDisruption ? "combined" : "official",
        lastCheckedAt: args.fetchedAt,
        expectedReturnAt: hasOfficialDisruption
          ? lift.expectedReturnAt
          : hasOtherDisruption
            ? lift.expectedReturnAt
            : undefined,
      });
    }

    const completedAt = Date.now();
    await ctx.db.insert("sourceSnapshots", {
      source: sourceName,
      status: "success",
      itemCount: args.disruptions.length,
      matchedCount,
      fetchedAt: args.fetchedAt,
      completedAt,
    });

    return {
      status: "success" as const,
      itemCount: args.disruptions.length,
      matchedCount,
      fetchedAt: args.fetchedAt,
      completedAt,
    };
  },
});

export const recordSyncFailure = internalMutation({
  args: {
    fetchedAt: v.number(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sourceSnapshots", {
      source: sourceName,
      status: "failed",
      itemCount: 0,
      matchedCount: 0,
      fetchedAt: args.fetchedAt,
      completedAt: Date.now(),
      error: args.error,
    });
  },
});

export const getSyncStatus = query({
  args: {},
  handler: async (ctx) => {
    const latestSnapshot = await ctx.db
      .query("sourceSnapshots")
      .withIndex("by_fetched_at")
      .order("desc")
      .first();

    if (!latestSnapshot) {
      return null;
    }

    return {
      status: latestSnapshot.status,
      itemCount: latestSnapshot.itemCount,
      matchedCount: latestSnapshot.matchedCount,
      fetchedAt: latestSnapshot.fetchedAt,
      completedAt: latestSnapshot.completedAt,
      error: latestSnapshot.error,
    };
  },
});
