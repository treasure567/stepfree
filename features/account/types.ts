export type MobilityMode =
  | "wheelchair"
  | "mobility-aid"
  | "limited-walking";

export type AccountProfile = {
  _id: string;
  username: string;
  displayName: string;
  email?: string;
  emailVerifiedAt?: number;
  pendingEmail?: string;
  mobilityMode: MobilityMode;
  needsStepFreeToTrain: boolean;
  avoidsStairs: boolean;
  prefersFewerChanges: boolean;
  maxWalkingMinutes: number;
  homeStationSlug?: string;
};
