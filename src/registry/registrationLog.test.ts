import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * A COUNT CANNOT NAME WHAT IS MISSING.
 *
 * `[ADR-0017] frontend capabilities registered: <n>` printed `resp.accepted` — the SERVER's
 * count. Not what the client offered, and no names on either side. A row the client sent and
 * the server silently dropped was therefore invisible: the two numbers never appeared
 * together, so there was nothing to compare them against.
 *
 * And the count can be exactly right for the wrong state. 22 offered, 22 accepted, one
 * refused, and the number is correct FOR THE REJECTION — which is how a session was spent on
 * CANVAS_SEED.
 *
 * Source-level because the subject is a console line in an auth-gated effect that fires once
 * per page load. Rendering it in jsdom would mean standing up an OIDC session to assert on a
 * string, and the assertion would still be about the source text. What matters is that the
 * instrument keeps reporting both sides.
 */
import { describe, it, expect } from "vitest";

const APP = readFileSync(path.join(__dirname, "../App.tsx"), "utf8");

/**
 * The console.info ARGUMENT LIST alone.
 *
 * Bounding matters more than it looks. A first version of these assertions sliced 400
 * characters from the log string and passed while the log had been reverted to printing the
 * accepted count alone — because the mismatch check a few lines below also mentions
 * `sent.length`, and the loose window swept it in. The guard was reading the right file and
 * the wrong region, which is the same shape as a count that is right for the wrong state.
 */
const LOG_ARGS = (() => {
  // Anchored on the MESSAGE, not on "console.info(" — App.tsx has more than one, and the
  // first is a different line entirely. A slice can read the wrong region as easily as the
  // wrong file.
  const start = APP.indexOf(String.fromCharCode(34) + "[ADR-0017] frontend capabilities");
  const end = APP.indexOf(");", start);
  return start >= 0 && end > start ? APP.slice(start, end) : "";
})();

describe("the registration log reports BOTH sides", () => {
  it("the source is read — positive control", () => {
    expect(APP).toContain("useFrontendCapabilityRegistration");
  });

  it("assembles ONCE and logs the same value it sent", () => {
    // Recomputing the list inside the handler would report what the assembler produces NOW
    // rather than what this request carried — identical today, and a lie the first time the
    // two can differ. That is the same class as reading a spec instead of the running pod.
    expect(APP).toMatch(/const sent = assembleCapabilities\(CORTEX_UI_CAPABILITIES\)/);
    expect(APP).toContain("capabilities: sent,");
    // Exactly one assembly call — a second would reintroduce the drift this prevents.
    expect(APP.split("assembleCapabilities(CORTEX_UI_CAPABILITIES)").length - 1).toBe(1);
  });

  it("prints the SENT count, not only the accepted one", () => {
    expect(LOG_ARGS.length).toBeGreaterThan(20); // positive control on the slice
    expect(LOG_ARGS).toContain("sent.length");
    expect(LOG_ARGS).toContain("resp.accepted");
  });

  it("prints the rows BY NAME — archetype and subject, which is what a graph query matches", () => {
    // The count is the thing that cannot answer "which". Archetype alone cannot either:
    // INTERVAL_TIMELINE already serves two subjects and KNOWLEDGE_DOCUMENT six, so a name
    // without its subject_uri does not identify a row.
    expect(APP).toMatch(/c\.archetype \+ " \| " \+ c\.subject_uri/);
    // And the list must actually REACH the console. Computing `names` and never passing it is
    // a dead local that typechecks, lints clean, and logs nothing — the same unreachable-path
    // shape as a module no one imports.
    expect(LOG_ARGS).toContain("names");
  });

  it("WARNS when the two counts disagree rather than leaving them to be compared", () => {
    // The server may refuse a row. It must not do so quietly: an unaccepted row and a row that
    // was never sent look identical from outside.
    expect(APP).toMatch(/if \(resp\.accepted !== sent\.length\)/);
    expect(APP).toContain("REGISTRATION MISMATCH");
  });
});
