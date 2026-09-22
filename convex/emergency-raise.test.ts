import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { registerComponents } from "../test/register-components";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const SESSION = "s-sos-0000-1111-2222-3333";

describe("emergency.raise (full path with workflow + rate limiter)", () => {
  test("raises once, is idempotent within the window, and is visible to the session", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const first = await t.mutation(api.emergency.raise, {
      sessionId: SESSION,
      kind: "stuck-no-lift",
    });
    expect(first.status).toBe("raised");
    expect(first.duplicate).toBe(false);

    const second = await t.mutation(api.emergency.raise, {
      sessionId: SESSION,
      kind: "stuck-no-lift",
    });
    expect(second.duplicate).toBe(true);

    const list = await t.query(api.emergency.forSession, { sessionId: SESSION });
    expect(list.length).toBe(1);
    expect(list[0].status).toBe("raised");
  });

  test("the session owner can cancel; a stranger cannot", async () => {
    const t = convexTest(schema, modules);
    registerComponents(t);
    const raised = await t.mutation(api.emergency.raise, {
      sessionId: SESSION,
      kind: "trapped-in-lift",
      note: "stuck between platforms",
    });
    await expect(
      t.mutation(api.emergency.cancel, {
        emergencyId: raised.emergencyId,
        sessionId: "s-someone-else-9999-0000",
      }),
    ).rejects.toThrow();
    const cancelled = await t.mutation(api.emergency.cancel, {
      emergencyId: raised.emergencyId,
      sessionId: SESSION,
    });
    expect(cancelled.status).toBe("cancelled");
  });
});
