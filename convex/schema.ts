import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  mobilityModeValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    emailNormalized: v.optional(v.string()),
    emailVerifiedAt: v.optional(v.number()),
    pendingEmail: v.optional(v.string()),
    mobilityMode: mobilityModeValidator,
    needsStepFreeToTrain: v.boolean(),
    avoidsStairs: v.boolean(),
    prefersFewerChanges: v.boolean(),
    maxWalkingMinutes: v.number(),
    homeStationSlug: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_email", ["emailNormalized"]),
  emailVerifications: defineTable({
    userId: v.id("users"),
    email: v.string(),
    emailNormalized: v.string(),
    codeHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("verified"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    expiresAt: v.number(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_email", ["userId", "emailNormalized"])
    .index("by_idempotency", ["idempotencyKey"]),
  stations: defineTable({
    slug: v.string(),
    name: v.string(),
    city: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    lines: v.array(v.string()),
    externalIds: v.optional(v.array(v.string())),
    stepFreeAccess: v.union(
      v.literal("street-to-platform"),
      v.literal("street-to-train"),
      v.literal("partial"),
    ),
    sourceName: v.string(),
    sourceUrl: v.string(),
    lastVerifiedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_city", ["city"]),
  lifts: defineTable({
    stationId: v.id("stations"),
    name: v.string(),
    status: v.union(
      v.literal("working"),
      v.literal("out-of-service"),
      v.literal("unknown"),
    ),
    sourceType: v.union(
      v.literal("official"),
      v.literal("community"),
      v.literal("combined"),
    ),
    lastCheckedAt: v.number(),
    expectedReturnAt: v.optional(v.number()),
  })
    .index("by_station", ["stationId"])
    .index("by_status", ["status"]),
  connections: defineTable({
    fromStationId: v.id("stations"),
    toStationId: v.id("stations"),
    line: v.string(),
    durationMinutes: v.number(),
    accessibilityMinutes: v.number(),
  })
    .index("by_from", ["fromStationId"])
    .index("by_to", ["toStationId"]),
  incidents: defineTable({
    stationId: v.id("stations"),
    liftId: v.optional(v.id("lifts")),
    kind: v.union(
      v.literal("lift-outage"),
      v.literal("access-obstruction"),
      v.literal("station-closure"),
    ),
    status: v.union(v.literal("active"), v.literal("resolved")),
    severity: v.union(
      v.literal("advisory"),
      v.literal("route-blocking"),
    ),
    title: v.string(),
    description: v.string(),
    sourceType: v.union(
      v.literal("official"),
      v.literal("community"),
      v.literal("combined"),
    ),
    sourceName: v.string(),
    sourceUrl: v.optional(v.string()),
    confidence: v.number(),
    humanReviewed: v.optional(v.boolean()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    candidateId: v.optional(v.id("incidentCandidates")),
    sourceHash: v.optional(v.string()),
    model: v.optional(v.string()),
    sourceExcerpt: v.optional(v.string()),
    externalId: v.optional(v.string()),
    externalLiftIds: v.optional(v.array(v.string())),
    reportedAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_station", ["stationId"])
    .index("by_reported_at", ["reportedAt"]),
  reports: defineTable({
    stationId: v.id("stations"),
    liftId: v.optional(v.id("lifts")),
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    observation: v.union(
      v.literal("working"),
      v.literal("not-working"),
      v.literal("obstructed"),
    ),
    note: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    reviewStatus: v.union(
      v.literal("pending"),
      v.literal("corroborated"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(),
  })
    .index("by_station", ["stationId"])
    .index("by_session", ["sessionId"])
    .index("by_idempotency", ["idempotencyKey"]),
  journeys: defineTable({
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    fromStationId: v.id("stations"),
    toStationId: v.id("stations"),
    routeStationIds: v.array(v.id("stations")),
    durationMinutes: v.number(),
    baselineDurationMinutes: v.number(),
    changes: v.number(),
    status: v.union(
      v.literal("planned"),
      v.literal("rerouted"),
      v.literal("blocked"),
    ),
    incidentIds: v.array(v.string()),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_updated_at", ["updatedAt"])
    .index("by_idempotency", ["idempotencyKey"]),
  sourceSnapshots: defineTable({
    source: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    itemCount: v.number(),
    matchedCount: v.number(),
    fetchedAt: v.number(),
    completedAt: v.number(),
    error: v.optional(v.string()),
  }).index("by_fetched_at", ["fetchedAt"]),
  monitoringRuns: defineTable({
    sourceName: v.string(),
    sourceUrl: v.string(),
    contentHash: v.string(),
    status: v.union(
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    candidateCount: v.number(),
    model: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
  })
    .index("by_content_hash", ["contentHash"])
    .index("by_started_at", ["startedAt"]),
  incidentCandidates: defineTable({
    runId: v.id("monitoringRuns"),
    stationName: v.string(),
    dateText: v.string(),
    kind: v.union(
      v.literal("lift-outage"),
      v.literal("access-obstruction"),
      v.literal("station-closure"),
    ),
    title: v.string(),
    description: v.string(),
    severity: v.union(
      v.literal("advisory"),
      v.literal("route-blocking"),
    ),
    alternateAccess: v.string(),
    confidence: v.number(),
    sourceExcerpt: v.string(),
    excerptVerified: v.optional(v.boolean()),
    resolvedStationId: v.optional(v.id("stations")),
    reviewStatus: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
    reviewReason: v.optional(v.string()),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    incidentId: v.optional(v.id("incidents")),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_review_status", ["reviewStatus"]),
  demoIncidents: defineTable({
    sessionId: v.string(),
    stationId: v.id("stations"),
    status: v.union(v.literal("active"), v.literal("resolved")),
    severity: v.union(
      v.literal("advisory"),
      v.literal("route-blocking"),
    ),
    kind: v.union(
      v.literal("lift-outage"),
      v.literal("access-obstruction"),
      v.literal("station-closure"),
    ),
    title: v.string(),
    description: v.string(),
    sourceName: v.string(),
    sourceUrl: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    model: v.optional(v.string()),
    sourceExcerpt: v.optional(v.string()),
    confidence: v.number(),
    candidateKey: v.string(),
    acceptedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_station", ["sessionId", "stationId"]),
  routeWatches: defineTable({
    userId: v.id("users"),
    email: v.string(),
    emailNormalized: v.string(),
    fromStationId: v.id("stations"),
    toStationId: v.id("stations"),
    fromSlug: v.string(),
    toSlug: v.string(),
    mobilityMode: v.optional(mobilityModeValidator),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("cancelled"),
    ),
    baselineFingerprint: v.string(),
    lastNotifiedFingerprint: v.optional(v.string()),
    lastRerouted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_email_normalized", ["emailNormalized"])
    .index("by_user_route", ["userId", "fromStationId", "toStationId"]),
  watchStations: defineTable({
    watchId: v.id("routeWatches"),
    stationId: v.id("stations"),
  })
    .index("by_station", ["stationId"])
    .index("by_watch", ["watchId"]),
  alerts: defineTable({
    channel: v.union(v.literal("watch"), v.literal("drill")),
    watchId: v.optional(v.id("routeWatches")),
    sessionId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    email: v.string(),
    emailNormalized: v.string(),
    reason: v.union(
      v.literal("rerouted"),
      v.literal("blocked"),
      v.literal("restored"),
    ),
    fromSlug: v.string(),
    toSlug: v.string(),
    fromName: v.string(),
    toName: v.string(),
    incidentTitle: v.optional(v.string()),
    incidentId: v.optional(v.string()),
    durationBefore: v.optional(v.number()),
    durationAfter: v.optional(v.number()),
    delayMinutes: v.optional(v.number()),
    routeVia: v.optional(v.string()),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    providerMessageId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    attempts: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_watch", ["watchId"])
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_provider_message", ["providerMessageId"]),
  events: defineTable({
    type: v.string(),
    dedupeKey: v.string(),
    data: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("dispatched"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    dispatchedAt: v.optional(v.number()),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_status", ["status"])
    .index("by_type_and_created", ["type", "createdAt"]),
  idempotencyKeys: defineTable({
    scope: v.string(),
    key: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_scope_and_key", ["scope", "key"])
    .index("by_expires_at", ["expiresAt"]),
  emergencies: defineTable({
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    stationId: v.optional(v.id("stations")),
    stationSlug: v.optional(v.string()),
    journeyId: v.optional(v.id("journeys")),
    kind: v.union(
      v.literal("stuck-no-lift"),
      v.literal("trapped-in-lift"),
      v.literal("needs-assistance"),
    ),
    status: v.union(
      v.literal("raised"),
      v.literal("acknowledged"),
      v.literal("escalated"),
      v.literal("resolved"),
      v.literal("cancelled"),
    ),
    note: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactMasked: v.optional(v.string()),
    notifiedAt: v.optional(v.number()),
    escalatedAt: v.optional(v.number()),
    acknowledgedBy: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    reopenedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"])
    .index("by_station", ["stationId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_created_at", ["createdAt"]),
  emergencyNotes: defineTable({
    emergencyId: v.id("emergencies"),
    author: v.string(),
    authorKind: v.union(v.literal("traveller"), v.literal("operator")),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_emergency", ["emergencyId"]),
  inboundMessages: defineTable({
    source: v.literal("agentmail"),
    providerMessageId: v.string(),
    threadId: v.optional(v.string()),
    fromEmail: v.string(),
    fromNormalized: v.string(),
    subject: v.optional(v.string()),
    text: v.optional(v.string()),
    watchId: v.optional(v.id("routeWatches")),
    parsedIntent: v.optional(
      v.union(
        v.literal("arrived"),
        v.literal("still-stuck"),
        v.literal("pause"),
        v.literal("unknown"),
      ),
    ),
    idempotencyKey: v.string(),
    receivedAt: v.number(),
  })
    .index("by_provider_message", ["providerMessageId"])
    .index("by_from", ["fromNormalized"])
    .index("by_idempotency", ["idempotencyKey"]),
  webhookReceipts: defineTable({
    source: v.string(),
    eventId: v.string(),
    signatureValid: v.boolean(),
    status: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("duplicate"),
    ),
    receivedAt: v.number(),
  })
    .index("by_source_and_event", ["source", "eventId"])
    .index("by_received_at", ["receivedAt"]),
});
