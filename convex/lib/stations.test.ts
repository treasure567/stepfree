import { describe, expect, test } from "vitest";
import { normalizeStationName } from "./stations";

describe("normalizeStationName", () => {
  test("strips an 'Underground Station' suffix", () => {
    expect(normalizeStationName("Bond Street Underground Station")).toBe(
      "bond street",
    );
  });

  test("lower-cases and collapses punctuation", () => {
    expect(normalizeStationName("BOND STREET")).toBe("bond street");
    expect(normalizeStationName("London Bridge")).toBe("london bridge");
  });

  test("resolves a plain station name to itself", () => {
    expect(normalizeStationName("Farringdon")).toBe("farringdon");
  });
});
