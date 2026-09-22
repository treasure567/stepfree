import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync TfL lift disruptions",
  { minutes: 5 },
  internal.ops.enqueueTflSync,
  {},
);

crons.interval(
  "extract official accessibility evidence",
  { hours: 6 },
  internal.workflows.startEvidenceWorkflow,
  {},
);

crons.interval(
  "clean up expired idempotency keys",
  { hours: 12 },
  internal.ops.cleanupExpired,
  {},
);

crons.interval(
  "reconcile stuck alerts",
  { minutes: 15 },
  internal.ops.reconcileStuckAlerts,
  {},
);

export default crons;
