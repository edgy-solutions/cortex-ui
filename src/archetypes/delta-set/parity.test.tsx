/**
 * ADR-0055 step 2's promise, made checkable: ZERO VISUAL CHANGE across the extraction.
 *
 * `parity.baseline.json` is not generated here — it was generated ONCE, by a throwaway script, at
 * the pre-move HEAD `916610f`, before `planning/DeltaSet.tsx` became a package. This file re-draws
 * every one of those same payloads through the same real dispatch path (`SemanticInterpreter`,
 * never the bare card component — the thing under test is the WIRING, registry
 * lookup included, not just the card) and diffs the HTML. A baseline this test could regenerate
 * for itself would only ever agree with whatever the code does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "../../components/registry/SemanticInterpreter";
import { CAPTURE_FILES, parityComponents } from "./parityPopulation.testkit";
import baseline from "./parity.baseline.json";

afterEach(cleanup);

const SESSIONS = path.join(__dirname, "../../../sessions");
const readCapture = (f: string): unknown => JSON.parse(readFileSync(path.join(SESSIONS, f), "utf8"));

/** The population lives in `parityPopulation.testkit.ts`, shared with the raw-section seals. */
function renderFresh(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, component] of Object.entries(parityComponents(readCapture))) {
    const { container } = render(<SemanticInterpreter payload={{ components: [component] }} />);
    out[key] = container.innerHTML;
    cleanup();
  }
  return out;
}

const BASELINE = baseline as Record<string, string>;

describe("DELTA_SET parity — the package draws exactly what the pre-move card drew", () => {
  it("every baseline key renders byte-identical HTML today", () => {
    const fresh = renderFresh();
    for (const key of Object.keys(BASELINE)) {
      expect(fresh[key], `${key}: present in the baseline but not in a fresh render`).toBeDefined();
      expect(fresh[key], `${key}: HTML diverged from the pre-move baseline`).toBe(BASELINE[key]);
    }
  });

  it("the key SET matches, counted fresh — an added fixture or capture with no baseline entry is a red", () => {
    const fresh = renderFresh();
    expect(new Set(Object.keys(fresh))).toEqual(new Set(Object.keys(BASELINE)));
  });

  it("the baseline is at least the pre-move floor — 8 entries (8 fixtures, no capture)", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(8);
  });
});

/**
 * THE ARRIVAL ARM. `CAPTURE_FILES` is a NAMED list, so a capture that lands later is invisible to
 * the population above — and a package that declares `noAbsence` is exactly the one a new
 * capture could falsify. This arm reads EVERY sessions/*.json and fails when one carries a
 * `projected[]` entry for DELTA_SET that `CAPTURE_FILES` does not name.
 *
 * For DELTA_SET this arm IS the "seal when lot 3 lands" hook: no capture exists today, so
 * `CAPTURE_FILES` is empty and the day the producer's capture arrives this goes red until it is
 * named, baselined, and `noAbsence.test.tsx` has re-measured the claim against real data.
 */
describe("DELTA_SET arrival — a capture that lands is not invisible", () => {
  const files = readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
  let unparseable = 0;
  const landed: string[] = [];
  for (const f of files) {
    let data: { projected?: { archetype?: string }[] };
    try {
      data = readCapture(f) as typeof data;
    } catch {
      unparseable += 1;
      continue;
    }
    if (Array.isArray(data?.projected) && data.projected.some((p) => p?.archetype === "DELTA_SET")) {
      landed.push(f);
    }
  }

  it("sessions/ was actually scanned — the arm cannot pass on an empty directory read", () => {
    expect(files.length, "fewer than 30 sessions/*.json files scanned").toBeGreaterThanOrEqual(30);
    // Unparseable files are skipped and COUNTED, never silently absorbed.
    expect(unparseable, "unparseable sessions/*.json files").toBeLessThan(files.length);
  });

  it("every DELTA_SET capture in sessions/ is named in CAPTURE_FILES", () => {
    const unlisted = landed.filter((f) => !CAPTURE_FILES.includes(f));
    expect(
      unlisted,
      `a DELTA_SET capture landed in ${unlisted.join(", ")} — add it to CAPTURE_FILES and regenerate parity.baseline.json`,
    ).toEqual([]);
  });
});
