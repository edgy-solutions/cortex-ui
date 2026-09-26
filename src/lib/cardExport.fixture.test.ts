/**
 * IS THE FIXTURE STILL THE CAPTURE? — the seal nothing else in this repo provides.
 *
 * `cardExport.fixture.ts` says, at length, that every value in it is verbatim from Lane 1's
 * 2026-09-26 capture. **That sentence was written by the same hand that typed the values**, and
 * until this file existed nothing could contradict it: a transposed digit, a dropped row or a
 * tidied trailing zero would have sailed through every export seal, because those seals compare
 * the document to the fixture and would have agreed with each other about the wrong number.
 *
 * So the capture's own bytes are read off disk here and the fixture is compared to them. This is
 * the only assertion in the repo that can indict a TRANSCRIPTION, as opposed to a renderer.
 *
 * ── WHY THERE ARE TWO COPIES OF THE CAPTURE, AND WHY THAT IS NOT A DUPLICATE ───────────────
 *
 * Lane 1 delivered the capture inside a markdown report — prose, then a fenced `json` block. The
 * corpus instruments in `cardExportFinance.test.ts` glob `sessions/*payload*.json`, so a capture
 * that arrives as `.md` is invisible to every one of them. That is not hypothetical: the
 * never-observed seal in `projectedTupleParity.test.ts` stayed GREEN on the day it became false
 * for exactly this reason.
 *
 * The fenced block was therefore extracted to `sessions/2026-09-26-payload-lot4-contribution-
 * ranking.json`, byte for byte apart from line endings, and the extraction is CHECKED HERE
 * against the report it came from. Neither copy is the derived one in the sense that matters: the
 * report is the origin, and the `.json` must keep agreeing with it or this file goes red.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOT4_CONTRIBUTION_RANKING_PAYLOAD,
  LOT4_EXPORT_PROVENANCE,
  LOT4_WIRE_ROWS,
  RETIRED_SHAPE_ONLY_ROWS,
  LOT4_PRODUCER_METHOD_RAW,
} from "./cardExport.fixture";

const REPORT =
  "sessions/2026-09-26-capture-from-lane-1-the-lot-4-contribution-ranking-card-real-and-post-projector.md";
const CAPTURE = "sessions/2026-09-26-payload-lot4-contribution-ranking.json";

const captureText = readFileSync(CAPTURE, "utf8");

interface WireCapture {
  final: {
    components: Record<string, unknown>[];
    presentation_provenance: Record<string, unknown>;
  };
  events: { event: string; data?: Record<string, unknown> }[];
}

const capture = JSON.parse(captureText) as WireCapture;

describe("the extracted capture is the report's own fenced block", () => {
  it("re-extracting from the report yields the same document", () => {
    // ⚠ LINE ENDINGS ARE NORMALISED AND NOTHING ELSE IS. The report is CRLF in this working tree
    // (git's autocrlf) and the extract is LF, so a raw byte compare fails for a reason that has
    // nothing to do with the data. Both a text compare after normalisation AND a parsed compare
    // are asserted, because the first catches a reordered key the second cannot see and the
    // second catches an encoding change the first would report as a total mismatch.
    const report = readFileSync(REPORT, "utf8").replace(/\r\n/g, "\n");
    const lines = report.split("\n");
    const open = lines.findIndex((l) => l.trim() === "```json");
    expect(open, "no fenced json block in the report — the extraction has no source").toBeGreaterThan(-1);
    let close = -1;
    for (let i = open + 1; i < lines.length; i++) {
      if (lines[i].trim() === "```") {
        close = i;
        break;
      }
    }
    expect(close, "the fence never closes").toBeGreaterThan(open);
    const block = lines.slice(open + 1, close).join("\n");

    expect(captureText.replace(/\r\n/g, "\n").trimEnd()).toBe(block.trimEnd());
    expect(JSON.parse(block)).toEqual(capture);
  });

  it("the capture is the shape the browser receives, and it is NOT the corpus envelope shape", () => {
    // Stated as an assertion because the corpus loader had to grow a second reader for it, and a
    // future reader will want to know that was necessary rather than careless.
    expect(Object.keys(capture).sort()).toEqual(["events", "final"]);
    expect(capture).not.toHaveProperty("projected");
    expect(capture.final.components).toHaveLength(1);
    expect(capture.events).toHaveLength(15);
    expect(capture.events.at(-1)?.event).toBe("stream_end");
  });
});

describe("the payload fixture is the capture, value for value", () => {
  it("deep-equals `final.components[0]`", () => {
    // THE WHOLE POINT OF THIS FILE. Not a spot check of a few fields: the entire object, so a key
    // that crept in or went missing during transcription is caught as readily as a wrong digit.
    expect(LOT4_CONTRIBUTION_RANKING_PAYLOAD).toEqual(capture.final.components[0]);
  });

  it("and so do the rows, including the string/number mixture", () => {
    // Asserted separately from the object compare above, because the mixture is the thing most
    // likely to be "cleaned up" by a well-meaning later edit — and `toEqual` on the parent would
    // report it as one unhelpful diff over four rows.
    expect(LOT4_WIRE_ROWS).toEqual(capture.final.components[0].rows);
    const rows = capture.final.components[0].rows as Record<string, unknown>[];
    expect(typeof rows[0].amount).toBe("string");
    expect(typeof rows[0].contribution).toBe("number");
    expect(rows[0].amount).not.toBe(String(rows[0].contribution));
  });

  it("there is no `method` key anywhere in the capture — the header's claim, measured", () => {
    // The fixture header states this and the order that commissioned the work said to "render the
    // `method` block from the real wire". The real wire has no method block. A prose claim about
    // an absence is the easiest kind to get wrong, so it is swept for here rather than trusted.
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return void v.forEach(walk);
      if (v !== null && typeof v === "object") {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          keys.add(k);
          walk(val);
        }
      }
    };
    walk(capture);
    // The control first: the sweep must be finding keys at all, or the absence below is a claim
    // about the walker.
    expect(keys.size).toBeGreaterThan(20);
    expect(keys).toContain("threshold_defaulted");
    expect(keys.has("method")).toBe(false);
    expect(keys.has("formula")).toBe(false);
  });
});

describe("provenance, field by field, against where each value actually came from", () => {
  const routeDecision = capture.events.find((e) => e.event === "route_decision")?.data as
    | {
        action?: { label?: string };
        handled_by?: { engine_name?: string };
        acting?: { persona?: string };
      }
    | undefined;

  it("persona, verb and engine come from the `route_decision` event", () => {
    expect(routeDecision, "no route_decision event — three fields below have no source").toBeDefined();
    expect(LOT4_EXPORT_PROVENANCE.persona).toBe(routeDecision?.acting?.persona);
    expect(LOT4_EXPORT_PROVENANCE.verb).toBe(routeDecision?.action?.label);
    expect(LOT4_EXPORT_PROVENANCE.engine).toBe(routeDecision?.handled_by?.engine_name);
  });

  it("`roll_sha` and `timestamp` are null because the capture carries neither", () => {
    // The previous fixture filled `roll_sha` from an UNRELATED capture's `fleet_sha`, which made a
    // derivation read as a measurement. Both the null and the reason for it are asserted, so
    // nobody refills them from whatever is nearest.
    expect(LOT4_EXPORT_PROVENANCE.roll_sha).toBeNull();
    expect(LOT4_EXPORT_PROVENANCE.timestamp).toBeNull();
    expect(captureText).not.toContain("fleet_sha");
    expect(captureText).not.toContain("code_hash");
  });

  it("⛔ `question_asked` is NOT in the stream — it comes from Lane 1's prose, and that is recorded", () => {
    // THE ONE FIELD WHOSE SOURCE IS NOT THE EVENT STREAM. The fixture header said provenance came
    // "from THIS capture's own route_decision event"; for five of six fields that is true and for
    // this one it is not. The question text appears only in the report's prose, where Lane 1
    // states the census row that was fired. Corrected in the header, and pinned here, because a
    // field with a quietly different provenance is how a fixture stops being a capture.
    const question = LOT4_EXPORT_PROVENANCE.question_asked ?? "";
    expect(question).toBe("how concentrated is purchasing on lot 4");
    expect(captureText).not.toContain(question);
    expect(readFileSync(REPORT, "utf8")).toContain(question);
  });
});

describe("the retired rows are foreign to this wire — which is why they are retired", () => {
  it("no retired entity appears anywhere in the capture", () => {
    // They were annotated "the producer's real row shape, field for field" by their author. They
    // are not this producer's row shape, and this is the measurement that says so rather than a
    // comment claiming it.
    for (const r of RETIRED_SHAPE_ONLY_ROWS) {
      expect(captureText).not.toContain(r.entity_id);
      expect(captureText).not.toContain(r.entity_name);
    }
  });

  it("and the real wire names its suppliers, so the two sets cannot be confused", () => {
    // The control on the assertion above: a capture containing none of the retired names proves
    // nothing if the same instrument finds none of the real ones either.
    for (const r of LOT4_WIRE_ROWS) expect(captureText).toContain(r.supplier);
  });
});

/**
 * THE TRANSCRIBED METHOD BLOCK AGAINST THE TWO THINGS IT CAN BE CHECKED AGAINST.
 *
 * `LOT4_PRODUCER_METHOD_RAW` is not a capture — it is the producer's emitted shape, transcribed —
 * so most of it cannot be checked here at all, and pretending otherwise is the failure mode this
 * file exists to prevent. What CAN be checked is its own header's claim about which of its values
 * are grounded in these bytes. Four are, one is arithmetic over these bytes, and two are not in the
 * capture at all. Each of those three classes gets an assertion, because a fixture header that
 * sorts its own values into grounded and composed is exactly the kind of claim that rots.
 */
describe("the transcribed method block, against the capture it says it is grounded in", () => {
  const raw = LOT4_PRODUCER_METHOD_RAW;
  const byName = (n: string) => raw.inputs.find((i) => i.name === n);

  it("the four grounded inputs match the capture's own fields", () => {
    const comp = capture.final?.components?.[0] as Record<string, unknown>;
    // The bound, from the envelope pair — three declarations of one number that must agree.
    expect(byName("threshold")?.value).toBe(comp.threshold);
    expect(String(raw.bound)).toBe(comp.threshold);
    expect(raw.bound_defaulted).toBe(comp.threshold_defaulted);
    // The lot, from the scope label rather than from a `lot` field, because there is no `lot`
    // field — see the absence asserted below.
    expect(comp.scope_label).toBe(`Lot ${byName("lot")?.value}`);
    // The supplier count, from the rows themselves.
    expect(byName("suppliers")?.value).toBe(String((comp.rows as unknown[]).length));
  });

  it("the derived input is RECOMPUTED here, not trusted — the total is the sum of the amounts", () => {
    // ⚠ THE ONE VALUE IN THAT FIXTURE THAT IS ARITHMETIC. The header says so and says this test
    // redoes it. Summed in cents as integers: the four amounts arrive as decimal STRINGS and
    // adding them as floats is how a total comes to end in `.19999999`.
    const rows = capture.final?.components?.[0]?.rows as { amount: string }[];
    const cents = rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);
    const total = (cents / 100).toFixed(2);
    expect(rows).toHaveLength(4); // the control: an empty list sums to "0.00" and matches nothing
    expect(byName("total purchased value")?.value).toBe(total);
    expect(total).toBe("1475520.00");
  });

  it("⛔ and the two ungrounded values say so in words — `fiscal_year` is nowhere in these bytes", () => {
    // The projector's allowlist strips the producer's `lot`, `fiscal_year`, `purchased_value`,
    // `largest_share` and `suppliers_above_threshold`. Asserted over the WHOLE capture text, not
    // just the component, because an envelope field surviving in some event would make this a
    // different finding — the card could then have had it.
    for (const stripped of [
      "fiscal_year",
      "purchased_value",
      "largest_share",
      "suppliers_above_threshold",
      "output_uri",
    ]) {
      expect(captureText, `${stripped} survived the projector after all`).not.toContain(
        `"${stripped}"`,
      );
    }
    // The control: a key that IS there, read by the same instrument.
    expect(captureText).toContain('"scope_label"');

    // So the two values that could not be grounded are marked rather than invented. This asserts
    // the MARKING, which is the only honest thing left to assert about them.
    expect(byName("fiscal_year")?.value).toContain("not in the capture");
    expect(raw.producer_sha).toContain("not in the capture");
  });

  it("the method block is the only route by which three of the stripped inputs reach a reader", () => {
    // THE FINDING, kept as an assertion: `lot`, `fiscal_year` and the total purchased value are all
    // stated among the method's inputs, and all three are absent from the projected component. So
    // the absent `method` costs the reader the inputs, not just the formula — which is why the
    // vintage question in `projectedTupleParity.test.ts` is worth chasing rather than noting.
    const comp = capture.final?.components?.[0] as Record<string, unknown>;
    const declaredInMethod = raw.inputs.map((i) => i.name);
    expect(declaredInMethod).toEqual([
      "lot",
      "fiscal_year",
      "total purchased value",
      "suppliers",
      "threshold",
    ]);
    // Of those five, exactly one is a key on the component: the bound. The other four reach a
    // reader only through the block that did not arrive.
    const alsoOnTheComponent = declaredInMethod.filter((n) => n in comp);
    expect(alsoOnTheComponent).toEqual(["threshold"]);
  });
});
