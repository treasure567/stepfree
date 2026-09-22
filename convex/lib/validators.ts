import { v } from "convex/values";

export const mobilityModeValidator = v.union(
  v.literal("wheelchair"),
  v.literal("mobility-aid"),
  v.literal("limited-walking"),
);

export const coordinateValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
});

export const streetManeuverValidator = v.object({
  instruction: v.string(),
  distanceMeters: v.number(),
  timeSeconds: v.number(),
  type: v.number(),
});

export const streetRouteValidator = v.object({
  provider: v.literal("valhalla"),
  distanceMeters: v.number(),
  durationSeconds: v.number(),
  geometry: v.array(coordinateValidator),
  maneuvers: v.array(streetManeuverValidator),
  generatedAt: v.number(),
});
