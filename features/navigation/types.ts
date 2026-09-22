export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Station = Coordinate & {
  id: string;
  slug: string;
  name: string;
  city: string;
  lines: string[];
  stepFreeAccess: "street-to-platform" | "street-to-train" | "partial";
};

export type Incident = Coordinate & {
  id: string;
  stationId: string;
  stationName: string;
  title: string;
  severity: "advisory" | "route-blocking";
};

export type StreetRoute = {
  provider: "valhalla";
  distanceMeters: number;
  durationSeconds: number;
  geometry: Coordinate[];
  maneuvers: Array<{
    instruction: string;
    distanceMeters: number;
    timeSeconds: number;
    type: number;
  }>;
  generatedAt: number;
};

export type SelectionMode = "origin" | "destination" | null;
