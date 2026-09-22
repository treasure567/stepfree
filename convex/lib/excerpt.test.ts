import { describe, expect, test } from "vitest";
import { excerptIsVerbatim } from "./excerpt";

const source =
  "Bond Street: the lift to the Jubilee and Elizabeth line platforms is out of service until further notice. Please use London Bridge for a step-free interchange.";

describe("excerptIsVerbatim", () => {
  test("accepts a verbatim excerpt from the source", () => {
    expect(
      excerptIsVerbatim(
        source,
        "the lift to the Jubilee and Elizabeth line platforms is out of service",
      ),
    ).toBe(true);
  });

  test("matches across collapsed whitespace and newlines", () => {
    expect(
      excerptIsVerbatim(
        "the lift   is\nout of service until further notice",
        "the lift is out of service until further notice",
      ),
    ).toBe(true);
  });

  test("rejects a fabricated excerpt that is not in the source", () => {
    expect(
      excerptIsVerbatim(
        source,
        "the lift is fully operational and every platform is step-free",
      ),
    ).toBe(false);
  });

  test("rejects an excerpt shorter than the minimum length", () => {
    expect(excerptIsVerbatim(source, "Bond St")).toBe(false);
  });

  test("is case sensitive", () => {
    expect(excerptIsVerbatim(source, "THE LIFT TO THE JUBILEE AND ELIZABETH")).toBe(
      false,
    );
  });

  test("rejects an empty excerpt", () => {
    expect(excerptIsVerbatim(source, "")).toBe(false);
  });
});
