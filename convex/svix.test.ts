import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { verifySvixSignature, type SvixHeaders } from "./lib/svix";

const SECRET = `whsec_${Buffer.from("stepfree-svix-signing-material").toString("base64")}`;

function sign(id: string, timestamp: string, payload: string): string {
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

const payload = JSON.stringify({ type: "message.received", message: { from: "a@b.com" } });

describe("verifySvixSignature", () => {
  test("accepts a correctly signed webhook", async () => {
    const id = "msg_1";
    const ts = nowSeconds();
    const headers: SvixHeaders = {
      id,
      timestamp: ts,
      signature: `v1,${sign(id, ts, payload)}`,
    };
    expect(await verifySvixSignature({ secret: SECRET, payload, headers })).toBe(true);
  });

  test("accepts when one of several signatures matches", async () => {
    const id = "msg_2";
    const ts = nowSeconds();
    const headers: SvixHeaders = {
      id,
      timestamp: ts,
      signature: `v1,not-the-right-one v1,${sign(id, ts, payload)}`,
    };
    expect(await verifySvixSignature({ secret: SECRET, payload, headers })).toBe(true);
  });

  test("rejects a tampered payload", async () => {
    const id = "msg_3";
    const ts = nowSeconds();
    const headers: SvixHeaders = {
      id,
      timestamp: ts,
      signature: `v1,${sign(id, ts, payload)}`,
    };
    const tampered = payload.replace("a@b.com", "attacker@evil.com");
    expect(
      await verifySvixSignature({ secret: SECRET, payload: tampered, headers }),
    ).toBe(false);
  });

  test("rejects a stale timestamp outside the tolerance window", async () => {
    const id = "msg_4";
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const headers: SvixHeaders = {
      id,
      timestamp: ts,
      signature: `v1,${sign(id, ts, payload)}`,
    };
    expect(await verifySvixSignature({ secret: SECRET, payload, headers })).toBe(false);
  });

  test("rejects missing headers or secret", async () => {
    const id = "msg_5";
    const ts = nowSeconds();
    const good: SvixHeaders = {
      id,
      timestamp: ts,
      signature: `v1,${sign(id, ts, payload)}`,
    };
    expect(
      await verifySvixSignature({ secret: "", payload, headers: good }),
    ).toBe(false);
    expect(
      await verifySvixSignature({
        secret: SECRET,
        payload,
        headers: { id: null, timestamp: ts, signature: good.signature },
      }),
    ).toBe(false);
  });
});
