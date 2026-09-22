import { getAuthUserId } from "@convex-dev/auth/core";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export async function requireOps(ctx: QueryCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({ code: "UNAUTHORIZED_OPS" });
  }
  return userId as string;
}
