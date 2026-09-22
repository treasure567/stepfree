import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  emailVerificationPerUser: {
    kind: "fixed window",
    period: HOUR,
    rate: 3,
    capacity: 3,
  },
  emailVerificationGlobal: {
    kind: "token bucket",
    period: MINUTE,
    rate: 100,
    capacity: 100,
    shards: 5,
  },
  emailCodeAttempt: {
    kind: "fixed window",
    period: HOUR,
    rate: 10,
    capacity: 10,
  },
  streetRoutePerSession: {
    kind: "token bucket",
    period: MINUTE,
    rate: 20,
    capacity: 10,
  },
  streetRouteGlobal: {
    kind: "token bucket",
    period: MINUTE,
    rate: 300,
    capacity: 300,
    shards: 5,
  },
  communityReportPerSession: {
    kind: "fixed window",
    period: HOUR,
    rate: 8,
    capacity: 8,
  },
  communityReportGlobal: {
    kind: "token bucket",
    period: MINUTE,
    rate: 120,
    capacity: 120,
    shards: 5,
  },
  journeySavePerSession: {
    kind: "fixed window",
    period: HOUR,
    rate: 60,
    capacity: 60,
  },
  journeySaveGlobal: {
    kind: "token bucket",
    period: MINUTE,
    rate: 600,
    capacity: 600,
    shards: 5,
  },
  demoControlGlobal: {
    kind: "fixed window",
    period: MINUTE,
    rate: 20,
    capacity: 20,
  },
  demoControlPerSession: {
    kind: "fixed window",
    period: MINUTE,
    rate: 6,
    capacity: 6,
  },
  alertPerWatch: {
    kind: "fixed window",
    period: HOUR,
    rate: 6,
    capacity: 6,
  },
  alertGlobal: {
    kind: "token bucket",
    period: MINUTE,
    rate: 200,
    capacity: 200,
    shards: 5,
  },
  drillAlertPerSession: {
    kind: "fixed window",
    period: HOUR,
    rate: 12,
    capacity: 12,
  },
});
