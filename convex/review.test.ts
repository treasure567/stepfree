import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedCandidate(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const runId = await ctx.db.insert("monitoringRuns", {
      sourceName: "TfL",
      sourceUrl: "https://tfl.gov.uk",
      contentHash: "hash123",
      status: "completed",
      candidateCount: 1,
      startedAt: Date.now(),
    });
    const candidateId = await ctx.db.insert("incidentCandidates", {
      runId,
      stationName: "Bond Street",
      dateText: "today",
      kind: "lift-outage",
      title: "Lift out of service",
      description: "x",
      severity: "route-blocking",
      alternateAccess: "London Bridge",
      confidence: 0.9,
      sourceExcerpt: "the lift is out of service",
      reviewStatus: "pending",
      createdAt: Date.now(),
    });
    return { runId, candidateId };
  });
}

describe("review: reviewer boundary", () => {
  test("accept/reject reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { candidateId } = await seedCandidate(t);
    await expect(
      t.mutation(api.review.acceptCandidate, { candidateId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.review.rejectCandidate, { candidateId }),
    ).rejects.toThrow();
  });

  test("ops review queries reject unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const { runId } = await seedCandidate(t);
    await expect(t.query(api.review.recentRuns, {})).rejects.toThrow();
    await expect(
      t.query(api.review.candidatesForRun, { runId }),
    ).rejects.toThrow();
    await expect(t.query(api.review.recentlyReviewed, {})).rejects.toThrow();
  });

  test("pendingCandidates is public and surfaces the pending candidate", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    await seedCandidate(t);
    const pending = await t.query(api.review.pendingCandidates, {});
    expect(pending.length).toBe(1);
    expect(pending[0].stationName).toBe("Bond Street");
    expect(pending[0].acceptable).toBe(false);
  });
});
