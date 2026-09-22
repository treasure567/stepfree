import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedActivity(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("activity", {
      action: "alert.sent",
      provider: "agentmail",
      level: "success",
      summary: "Route alert delivered",
      createdAt: now,
    });
    await ctx.db.insert("activity", {
      action: "verification.sent",
      provider: "agentmail",
      level: "success",
      summary: "Verification code delivered",
      createdAt: now + 1,
    });
    await ctx.db.insert("activity", {
      action: "evidence.scraped",
      provider: "firecrawl",
      level: "info",
      summary: "Firecrawl fetched the source",
      createdAt: now + 2,
    });
  });
}

describe("activity telemetry", () => {
  test("recent and stats reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedActivity(t);
    await expect(t.query(api.activity.recent, {})).rejects.toThrow();
    await expect(t.query(api.activity.stats, {})).rejects.toThrow();
  });

  test("records surface in recent, filter by provider, and aggregate in stats", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedActivity(t);
    const asOps = t.withIdentity({ subject: "ops-user" });

    const all = await asOps.query(api.activity.recent, {});
    expect(all).toHaveLength(3);
    expect(all[0].summary).toBe("Firecrawl fetched the source");

    const agentmail = await asOps.query(api.activity.recent, {
      provider: "agentmail",
    });
    expect(agentmail).toHaveLength(2);
    expect(agentmail.every((row) => row.provider === "agentmail")).toBe(true);

    const stats = await asOps.query(api.activity.stats, {});
    expect(stats.total).toBe(3);
    expect(stats.byProvider.agentmail).toBe(2);
    expect(stats.byProvider.firecrawl).toBe(1);
    expect(stats.byLevel.success).toBe(2);
  });
});
