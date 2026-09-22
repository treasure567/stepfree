import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

export const extractionPool = new Workpool(components.extractionPool, {
  maxParallelism: 3,
});

export const deliveryPool = new Workpool(components.deliveryPool, {
  maxParallelism: 5,
});
