import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseContext = Pick<QueryCtx | MutationCtx, "db">;

type QueueItem = {
  stationId: Id<"stations">;
  line: string | null;
  distance: number;
};

type RouteStep = {
  previousKey: string;
  fromStationId: Id<"stations">;
  toStationId: Id<"stations">;
  connection: Doc<"connections">;
  transferMinutes: number;
};

class MinimumQueue {
  private readonly items: QueueItem[] = [];

  get size() {
    return this.items.length;
  }

  push(item: QueueItem) {
    this.items.push(item);
    let index = this.items.length - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.items[parentIndex].distance <= item.distance) {
        break;
      }

      this.items[index] = this.items[parentIndex];
      index = parentIndex;
    }

    this.items[index] = item;
  }

  pop() {
    const first = this.items[0];
    const last = this.items.pop();

    if (!first || !last || this.items.length === 0) {
      return first;
    }

    let index = 0;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let nextIndex = index;

      if (
        leftIndex < this.items.length &&
        this.items[leftIndex].distance <
          (nextIndex === index ? last.distance : this.items[nextIndex].distance)
      ) {
        nextIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length &&
        this.items[rightIndex].distance <
          (nextIndex === index ? last.distance : this.items[nextIndex].distance)
      ) {
        nextIndex = rightIndex;
      }

      if (nextIndex === index) {
        break;
      }

      this.items[index] = this.items[nextIndex];
      index = nextIndex;
    }

    this.items[index] = last;
    return first;
  }
}

function routeKey(stationId: Id<"stations">, line: string | null) {
  return `${stationId}|${line ?? "start"}`;
}

function createAdjacency(connections: Doc<"connections">[]) {
  const adjacency = new Map<string, Doc<"connections">[]>();

  for (const connection of connections) {
    const from = adjacency.get(connection.fromStationId) ?? [];
    from.push(connection);
    adjacency.set(connection.fromStationId, from);
    const to = adjacency.get(connection.toStationId) ?? [];
    to.push(connection);
    adjacency.set(connection.toStationId, to);
  }

  return adjacency;
}

function findRoute(
  stations: Doc<"stations">[],
  connections: Doc<"connections">[],
  fromStationId: Id<"stations">,
  toStationId: Id<"stations">,
  unavailableStationIds: Set<string>,
) {
  if (
    unavailableStationIds.has(fromStationId) ||
    unavailableStationIds.has(toStationId)
  ) {
    return null;
  }

  const stationById = new Map(stations.map((station) => [station._id, station]));
  const adjacency = createAdjacency(connections);
  const distances = new Map<string, number>();
  const previous = new Map<string, RouteStep>();
  const queue = new MinimumQueue();
  queue.push({ stationId: fromStationId, line: null, distance: 0 });
  distances.set(routeKey(fromStationId, null), 0);
  let destinationKey: string | null = null;

  while (queue.size > 0) {
    const current = queue.pop();

    if (!current) {
      break;
    }

    const currentKey = routeKey(current.stationId, current.line);

    if (current.distance !== distances.get(currentKey)) {
      continue;
    }

    if (current.stationId === toStationId) {
      destinationKey = currentKey;
      break;
    }

    for (const connection of adjacency.get(current.stationId) ?? []) {
      const travelsForward = connection.fromStationId === current.stationId;
      const nextStationId = travelsForward
        ? connection.toStationId
        : connection.fromStationId;

      if (unavailableStationIds.has(nextStationId)) {
        continue;
      }

      const transferMinutes =
        current.line && current.line !== connection.line ? 4 : 0;
      const nextDistance =
        current.distance +
        connection.durationMinutes +
        connection.accessibilityMinutes +
        transferMinutes;
      const nextKey = routeKey(nextStationId, connection.line);

      if (nextDistance >= (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      distances.set(nextKey, nextDistance);
      previous.set(nextKey, {
        previousKey: currentKey,
        fromStationId: current.stationId,
        toStationId: nextStationId,
        connection,
        transferMinutes,
      });
      queue.push({
        stationId: nextStationId,
        line: connection.line,
        distance: nextDistance,
      });
    }
  }

  if (!destinationKey) {
    return null;
  }

  const reversedSteps: RouteStep[] = [];
  let currentKey = destinationKey;

  while (previous.has(currentKey)) {
    const step = previous.get(currentKey);

    if (!step) {
      break;
    }

    reversedSteps.push(step);
    currentKey = step.previousKey;
  }

  const steps = reversedSteps.reverse();
  const routeStationIds = [
    fromStationId,
    ...steps.map((step) => step.toStationId),
  ];
  const routeStations = routeStationIds.map((stationId) => {
    const station = stationById.get(stationId);

    if (!station) {
      throw new Error(`Missing station ${stationId}`);
    }

    return station;
  });
  const lines = steps.map((step) => step.connection.line);
  const changes = lines.reduce(
    (total, line, index) =>
      index > 0 && line !== lines[index - 1] ? total + 1 : total,
    0,
  );

  return {
    durationMinutes: distances.get(destinationKey) ?? 0,
    changes,
    routeStations,
    segments: steps.map((step) => ({
      fromStationId: step.fromStationId,
      toStationId: step.toStationId,
      line: step.connection.line,
      durationMinutes:
        step.connection.durationMinutes +
        step.connection.accessibilityMinutes +
        step.transferMinutes,
      includesTransfer: step.transferMinutes > 0,
    })),
  };
}

type ActiveIncident = {
  id: string;
  stationId: Id<"stations">;
  title: string;
  description: string;
  sourceName: string;
  severity: "advisory" | "route-blocking";
  confidence: number;
  updatedAt: number;
  isDemo: boolean;
  humanReviewed: boolean;
  blocks: boolean;
};

export async function calculateTransitRoute(
  ctx: DatabaseContext,
  fromSlug: string,
  toSlug: string,
  options?: { sessionId?: string },
) {
  const [stations, connections, lifts, incidents] = await Promise.all([
    ctx.db.query("stations").collect(),
    ctx.db.query("connections").collect(),
    ctx.db.query("lifts").collect(),
    ctx.db
      .query("incidents")
      .withIndex("by_status", (query) => query.eq("status", "active"))
      .collect(),
  ]);
  const sessionId = options?.sessionId;
  const demoIncidents = sessionId
    ? await ctx.db
        .query("demoIncidents")
        .withIndex("by_session", (query) => query.eq("sessionId", sessionId))
        .filter((query) => query.eq(query.field("status"), "active"))
        .collect()
    : [];
  const activeIncidents: ActiveIncident[] = [
    ...incidents.map((incident) => {
      const humanReviewed = incident.humanReviewed === true;
      return {
        id: incident._id as string,
        stationId: incident.stationId,
        title: incident.title,
        description: incident.description,
        sourceName: incident.sourceName,
        severity: incident.severity,
        confidence: incident.confidence,
        updatedAt: incident.updatedAt,
        isDemo: false,
        humanReviewed,
        blocks: incident.severity === "route-blocking" && humanReviewed,
      };
    }),
    ...demoIncidents.map((incident) => ({
      id: incident._id as string,
      stationId: incident.stationId,
      title: incident.title,
      description: incident.description,
      sourceName: incident.sourceName,
      severity: incident.severity,
      confidence: incident.confidence,
      updatedAt: incident.updatedAt,
      isDemo: true,
      humanReviewed: true,
      blocks: incident.severity === "route-blocking",
    })),
  ];
  const stationBySlug = new Map(
    stations.map((station) => [station.slug, station]),
  );
  const fromStation = stationBySlug.get(fromSlug);
  const toStation = stationBySlug.get(toSlug);

  if (!fromStation || !toStation) {
    return {
      status: "station-not-found" as const,
      missing: !fromStation ? fromSlug : toSlug,
    };
  }

  if (fromStation._id === toStation._id) {
    return {
      status: "same-station" as const,
      stationName: fromStation.name,
    };
  }

  const unavailableStationIds = new Set<string>();

  for (const incident of activeIncidents) {
    if (incident.blocks) {
      unavailableStationIds.add(incident.stationId);
    }
  }

  const baselineRoute = findRoute(
    stations,
    connections,
    fromStation._id,
    toStation._id,
    new Set(),
  );
  const accessibleRoute = findRoute(
    stations,
    connections,
    fromStation._id,
    toStation._id,
    unavailableStationIds,
  );

  if (!baselineRoute) {
    return {
      status: "no-network-route" as const,
      fromName: fromStation.name,
      toName: toStation.name,
    };
  }

  if (!accessibleRoute) {
    const blockingIncidents = activeIncidents.filter(
      (incident) =>
        incident.blocks &&
        baselineRoute.routeStations.some(
          (station) => station._id === incident.stationId,
        ),
    );
    const blockedBaselineSlugs = baselineRoute.routeStations
      .map((station) => station.slug)
      .join(",");
    return {
      status: "blocked" as const,
      fromId: fromStation._id,
      toId: toStation._id,
      fromName: fromStation.name,
      toName: toStation.name,
      incidentIds: blockingIncidents.map((incident) => incident.id),
      blockingIncidents: blockingIncidents.map((incident) => ({
        id: incident.id,
        title: incident.title,
        description: incident.description,
        sourceName: incident.sourceName,
        updatedAt: incident.updatedAt,
        isDemo: incident.isDemo,
      })),
      fingerprint: `blocked:${fromStation.slug}>${toStation.slug}`,
      baselineFingerprint: `ready:${blockedBaselineSlugs}`,
      baselineStationIds: baselineRoute.routeStations.map(
        (station) => station._id,
      ),
    };
  }

  const baselineSlugs = baselineRoute.routeStations
    .map((station) => station.slug)
    .join(",");
  const accessibleSlugs = accessibleRoute.routeStations
    .map((station) => station.slug)
    .join(",");
  const routeStationIdSet = new Set(
    accessibleRoute.routeStations.map((station) => station._id),
  );
  const routeLifts = lifts.filter((lift) =>
    routeStationIdSet.has(lift.stationId),
  );
  const relevantIncidents = activeIncidents
    .filter((incident) =>
      baselineRoute.routeStations.some(
        (station) => station._id === incident.stationId,
      ),
    )
    .sort((left, right) => {
      if (left.blocks !== right.blocks) {
        return left.blocks ? -1 : 1;
      }
      if (left.isDemo !== right.isDemo) {
        return left.isDemo ? -1 : 1;
      }
      return right.updatedAt - left.updatedAt;
    });

  return {
    status: "ready" as const,
    fromId: fromStation._id,
    toId: toStation._id,
    fromName: fromStation.name,
    toName: toStation.name,
    routeStationIds: accessibleRoute.routeStations.map(
      (station) => station._id,
    ),
    stations: accessibleRoute.routeStations.map((station) => ({
      id: station._id,
      slug: station.slug,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      lines: station.lines,
    })),
    segments: accessibleRoute.segments,
    durationMinutes: accessibleRoute.durationMinutes,
    baselineDurationMinutes: baselineRoute.durationMinutes,
    delayMinutes: Math.max(
      0,
      accessibleRoute.durationMinutes - baselineRoute.durationMinutes,
    ),
    changes: accessibleRoute.changes,
    workingLifts: routeLifts.filter((lift) => lift.status === "working").length,
    lastCheckedAt:
      routeLifts.length > 0
        ? Math.min(...routeLifts.map((lift) => lift.lastCheckedAt))
        : null,
    rerouted: baselineSlugs !== accessibleSlugs,
    fingerprint: `ready:${accessibleSlugs}`,
    baselineFingerprint: `ready:${baselineSlugs}`,
    baselineStationIds: baselineRoute.routeStations.map(
      (station) => station._id,
    ),
    incidentIds: relevantIncidents.map((incident) => incident.id),
    incidents: relevantIncidents.map((incident) => ({
      id: incident.id,
      stationId: incident.stationId,
      title: incident.title,
      description: incident.description,
      sourceName: incident.sourceName,
      severity: incident.severity,
      confidence: incident.confidence,
      updatedAt: incident.updatedAt,
      isDemo: incident.isDemo,
      humanReviewed: incident.humanReviewed,
      blocks: incident.blocks,
    })),
  };
}
