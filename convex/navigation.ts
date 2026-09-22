"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { rateLimiter } from "./lib/rateLimits";
import { coordinateValidator, streetRouteValidator } from "./lib/validators";
import {
  validateCoordinates,
  validateSessionId,
} from "./lib/validation";
import { requestWheelchairRoute } from "./providers/valhalla";

function distanceInKilometres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export const calculateStreetRoute = action({
  args: {
    origin: coordinateValidator,
    destination: coordinateValidator,
    sessionId: v.string(),
  },
  returns: streetRouteValidator,
  handler: async (ctx, args) => {
    validateCoordinates(args.origin.latitude, args.origin.longitude);
    validateCoordinates(args.destination.latitude, args.destination.longitude);
    const sessionId = validateSessionId(args.sessionId);
    const directDistance = distanceInKilometres(
      args.origin.latitude,
      args.origin.longitude,
      args.destination.latitude,
      args.destination.longitude,
    );

    if (directDistance < 0.01) {
      throw new ConvexError({ code: "ROUTE_TOO_SHORT" });
    }

    if (directDistance > 25) {
      throw new ConvexError({ code: "ROUTE_TOO_LONG", maximumKilometres: 25 });
    }

    await Promise.all([
      rateLimiter.limit(ctx, "streetRoutePerSession", {
        key: sessionId,
        throws: true,
      }),
      rateLimiter.limit(ctx, "streetRouteGlobal", { throws: true }),
    ]);

    return requestWheelchairRoute(args.origin, args.destination);
  },
});
