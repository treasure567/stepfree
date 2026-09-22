import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedEmergency(
  t: ReturnType<typeof convexTest>,
  sessionId: string,
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("emergencies", {
      sessionId,
      kind: "stuck-no-lift",
      status: "raised",
      idempotencyKey: `${sessionId}:seed`,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

describe("emergency notes, history & reopen", () => {
  test("the traveller can add a note and read it back", async () => {
    const t = convexTest(schema, modules);
    const id = await seedEmergency(t, "s1");
    const res = await t.mutation(api.emergency.addNote, {
      emergencyId: id,
      sessionId: "s1",
      text: "Stuck at the barrier, the lift is dark",
    });
    expect(res.authorKind).toBe("traveller");
    const notes = await t.query(api.emergency.notesFor, { emergencyId: id });
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain("Stuck at the barrier");
  });

  test("empty or whitespace notes are rejected", async () => {
    const t = convexTest(schema, modules);
    const id = await seedEmergency(t, "s1");
    await expect(
      t.mutation(api.emergency.addNote, {
        emergencyId: id,
        sessionId: "s1",
        text: "   ",
      }),
    ).rejects.toThrow();
  });

  test("a note from a non-owner requires an authenticated operator", async () => {
    const t = convexTest(schema, modules);
    const id = await seedEmergency(t, "s1");
    await expect(
      t.mutation(api.emergency.addNote, { emergencyId: id, text: "ops note" }),
    ).rejects.toThrow();
  });

  test("history paginates a session's emergencies", async () => {
    const t = convexTest(schema, modules);
    await seedEmergency(t, "s2");
    const page = await t.query(api.emergency.history, {
      sessionId: "s2",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.length).toBe(1);
    expect(page.isDone).toBe(true);
  });

  test("reopen requires an authenticated operator", async () => {
    const t = convexTest(schema, modules);
    const id = await seedEmergency(t, "s3");
    await expect(
      t.mutation(api.emergency.reopen, { emergencyId: id }),
    ).rejects.toThrow();
  });
});
