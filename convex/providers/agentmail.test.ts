import { describe, expect, test } from "vitest";
import { buildRouteAlertEmail, buildVerificationEmail } from "./agentmail";

describe("buildRouteAlertEmail", () => {
  test("a reroute names the alternative route and the added minutes", () => {
    const email = buildRouteAlertEmail({
      fromName: "Waterloo",
      toName: "Barbican",
      reason: "rerouted",
      affectedStation: "Bond Street",
      routeVia: "London Bridge",
      durationAfter: 36,
      delayMinutes: 5,
    });
    expect(email.subject).toContain("Step-free reroute");
    expect(email.subject).toContain("Waterloo to Barbican");
    expect(email.text).toContain("London Bridge");
    expect(email.text).toContain("36 minutes");
    expect(email.text).toContain("5 minutes added");
    expect(email.html).toContain("Your step-free route changed");
  });

  test("a blocked route says there is no step-free route right now", () => {
    const email = buildRouteAlertEmail({
      fromName: "Waterloo",
      toName: "Barbican",
      reason: "blocked",
      affectedStation: "Farringdon",
    });
    expect(email.subject).toContain("Step-free route alert");
    expect(email.text).toContain("no verified step-free route");
    expect(email.html).toContain("No step-free route right now");
  });

  test("a restored route confirms access is back", () => {
    const email = buildRouteAlertEmail({
      fromName: "Waterloo",
      toName: "Barbican",
      reason: "restored",
      affectedStation: "Bond Street",
      durationAfter: 31,
    });
    expect(email.subject).toContain("restored");
    expect(email.text).toContain("restored");
    expect(email.text).toContain("31 minutes");
  });

  test("a reroute with no delay omits the added-minutes clause", () => {
    const email = buildRouteAlertEmail({
      fromName: "Waterloo",
      toName: "Barbican",
      reason: "rerouted",
      routeVia: "London Bridge",
      durationAfter: 31,
      delayMinutes: 0,
    });
    expect(email.text).not.toContain("minutes added");
  });
});

describe("buildVerificationEmail", () => {
  test("includes the code and the recipient name", () => {
    const email = buildVerificationEmail({ code: "482913", displayName: "Maya" });
    expect(email.subject).toContain("482913");
    expect(email.text).toContain("Maya");
    expect(email.text).toContain("482913");
    expect(email.html).toContain("482913");
  });

  test("escapes HTML in the display name", () => {
    const email = buildVerificationEmail({
      code: "111111",
      displayName: '<script>x</script>',
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
