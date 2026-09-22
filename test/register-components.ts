import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workpool from "@convex-dev/workpool/test";
import workflow from "@convex-dev/workflow/test";

export function registerComponents(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
) {
  rateLimiter.register(t, "rateLimiter");
  workpool.register(t, "extractionPool");
  workpool.register(t, "deliveryPool");
  workflow.register(t, "workflow");
}
