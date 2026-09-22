import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync TfL lift disruptions",
  { minutes: 5 },
  internal.tfl.syncLiftDisruptions,
  {},
);

crons.interval(
  "extract official accessibility evidence",
  { hours: 6 },
  internal.monitoring.refreshOfficialAccessibilityEvidence,
  {},
);

export default crons;
