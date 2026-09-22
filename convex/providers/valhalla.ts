import type { Infer } from "convex/values";
import { streetRouteValidator } from "../lib/validators";

type StreetRoute = Infer<typeof streetRouteValidator>;
type Point = { latitude: number; longitude: number };

type ValhallaResponse = {
  trip?: {
    status?: number;
    summary?: { length?: number; time?: number };
    legs?: Array<{
      shape?: string;
      maneuvers?: Array<{
        instruction?: string;
        length?: number;
        time?: number;
        type?: number;
      }>;
    }>;
  };
  error?: string;
};

function decodePolyline6(encoded: string) {
  const coordinates: Point[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({
      latitude: latitude / 1_000_000,
      longitude: longitude / 1_000_000,
    });
  }

  return coordinates;
}

export async function requestWheelchairRoute(
  origin: Point,
  destination: Point,
): Promise<StreetRoute> {
  const endpoint =
    process.env.VALHALLA_URL?.trim() ??
    "https://valhalla1.openstreetmap.de/route";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": "stepfree",
      },
      body: JSON.stringify({
        locations: [
          { lat: origin.latitude, lon: origin.longitude },
          { lat: destination.latitude, lon: destination.longitude },
        ],
        costing: "pedestrian",
        costing_options: {
          pedestrian: {
            transport_type: "wheelchair",
            max_distance: 25_000,
          },
        },
        directions_options: {
          units: "kilometers",
          language: "en-US",
        },
      }),
    });

    const payload = (await response.json()) as ValhallaResponse;

    if (!response.ok || payload.error || payload.trip?.status !== 0) {
      throw new Error(payload.error ?? `Routing failed with status ${response.status}`);
    }

    const summary = payload.trip.summary;
    const leg = payload.trip.legs?.[0];

    if (
      !summary ||
      typeof summary.length !== "number" ||
      typeof summary.time !== "number" ||
      !leg?.shape
    ) {
      throw new Error("Routing provider returned an invalid response");
    }

    return {
      provider: "valhalla",
      distanceMeters: Math.round(summary.length * 1_000),
      durationSeconds: Math.round(summary.time),
      geometry: decodePolyline6(leg.shape),
      maneuvers: (leg.maneuvers ?? []).map((maneuver) => ({
        instruction: maneuver.instruction ?? "Continue",
        distanceMeters: Math.round((maneuver.length ?? 0) * 1_000),
        timeSeconds: Math.round(maneuver.time ?? 0),
        type: maneuver.type ?? 0,
      })),
      generatedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
