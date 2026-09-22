import type { MutationCtx } from "../_generated/server";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function claimIdempotencyKey(
  ctx: MutationCtx,
  scope: string,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_scope_and_key", (q) => q.eq("scope", scope).eq("key", key))
    .unique();
  if (existing) {
    return false;
  }
  const now = Date.now();
  await ctx.db.insert("idempotencyKeys", {
    scope,
    key,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
  return true;
}

export async function hasIdempotencyKey(
  ctx: MutationCtx,
  scope: string,
  key: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_scope_and_key", (q) => q.eq("scope", scope).eq("key", key))
    .unique();
  return existing !== null;
}
