/**
 * SEALS ON THE CARD EXPORT.
 *
 * The order states two invariants and they are the two this file is built around:
 *
 *   "exported HTML contains every payload value verbatim"
 *   "absence of `method` renders the sentence, not a blank"
 *
 * ── WHY THE FIRST ONE IS NOT WRITTEN WITH `toContain` ─────────────────────────────────────
 *
 * The obvious spelling is `for (v of values) expect(html).toContain(v)`. It is weak in both
 * directions at once. It cannot see a value that WENT MISSING under a path that still renders
 * (`0.62` passes if it appears anywhere at all, including inside a hex colour or another row),
 * and it cannot see a value that CREPT IN — a duplicated row, a leaked field, a cell the builder
 * emitted twice all pass a containment sweep unchanged. A membership assertion is blind to
 * cardinality, so the seal here PARSES the document, extracts the payload table's path→value
 * pairs, and compares them to an independent flattening PAIRWISE, IN ORDER, WITH A COUNT.
 *
 * ── AND WHY THERE IS A NEGATIVE CONTROL FOR IT ────────────────────────────────────────────
 *
 * A seal that has only ever seen a correct document has not been shown to be capable of
 * indicting one. So `the verbatim seal can fail` doctors the export — removes one row, then
 * alters one value — and asserts the same comparison rejects it. Without that test, the pairwise
 * comparison and a `expect(true).toBe(true)` are indistinguishable from this file's evidence.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContributionRanking } from "@/components/planning/ContributionRanking";
import {
  ABSENT_MARK,
  METHOD_ABSENT_SENTENCE,
  NOT_STATED_MARK,
  buildCardExportHtml,
  exportFileName,
  flattenPayload,
  readExportProvenance,
  readMethod,
  stripExecutable,
  type CardExportInput,
  type MethodBlock,
  type PayloadCell,
} from "./cardExport";
import {
  LOT4_CONTRIBUTION_RANKING_PAYLOAD,
  LOT4_WIRE_ROWS,
  RETIRED_SHAPE_ONLY_ROWS,
  LOT4_EXPORT_PROVENANCE,
  LOT4_METHOD_PRESENT,
  LOT4_PRODUCER_METHOD_RAW,
} from "./cardExport.fixture";
// ca's OWN `model_dump(mode="json")`, lifted out of the 2026-09-26 packet into a file a fixture
// glob can see. The arm that ties it back to the packet's fence is in the last describe.
import PACKET_METHOD_CAPTURE from "./methodBlockPacketCapture.json";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** The payload table, read back out of the document exactly as a reader would see it. */
function readPayloadTable(html: string): PayloadCell[] {
  const doc = parse(html);
  const table = doc.querySelector("table[data-cx-payload-cells]");
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).map((tr) => ({
    path: tr.querySelector("td.cx-path")?.textContent ?? "",
    value: tr.querySelector("td.cx-value")?.textContent ?? "",
  }));
}

function sectionText(html: string, heading: string): string {
  const doc = parse(html);
  for (const s of Array.from(doc.querySelectorAll("section.cx-section"))) {
    if (s.querySelector("h2")?.textContent?.trim().toLowerCase() === heading.toLowerCase()) {
      return s.querySelector(".cx-body")?.textContent?.trim() ?? "";
    }
  }
  return "";
}

/** The card as the app actually draws it, so section 1 is not a stand-in. */
const CARD_HTML = renderToStaticMarkup(
  <ContributionRanking
    rows={LOT4_WIRE_ROWS}
    value_label={LOT4_CONTRIBUTION_RANKING_PAYLOAD.value_label}
    value_unit={LOT4_CONTRIBUTION_RANKING_PAYLOAD.value_unit}
    scope_label={LOT4_CONTRIBUTION_RANKING_PAYLOAD.scope_label}
  />,
);

function input(over: Partial<CardExportInput> = {}): CardExportInput {
  return {
    title: "Lot 4 · supplier concentration",
    archetype: "CONTRIBUTION_RANKING",
    cardHtml: CARD_HTML,
    css: ".neon { color: #64d9ff }",
    payload: LOT4_CONTRIBUTION_RANKING_PAYLOAD,
    method: null,
    provenance: LOT4_EXPORT_PROVENANCE,
    exportedAt: "2026-09-24T02:00:00.000Z",
    ...over,
  };
}

describe("every payload value, verbatim", () => {
  it("renders one cell per leaf, pairwise and in order, with the same count", () => {
    const html = buildCardExportHtml(input());
    const expected = flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD);
    const actual = readPayloadTable(html);

    // The count first and on its own: a length mismatch is the failure a pairwise loop reports
    // last and least clearly, and it is the one that means a value went missing or crept in.
    expect(actual).toHaveLength(expected.length);
    expect(actual).toEqual(expected);

    // And the document's own declared count agrees with what it actually emitted — otherwise the
    // attribute is decoration rather than a cross-check.
    const declared = parse(html)
      .querySelector("table[data-cx-payload-cells]")
      ?.getAttribute("data-cx-payload-cells");
    expect(declared).toBe(String(expected.length));
  });

  it("matches a hand-written leaf list — an oracle that does not route through the walker", () => {
    // WHY THIS EXISTS, WHEN THE TEST ABOVE ALREADY COMPARES PAIRWISE WITH A COUNT.
    //
    // That test compares the document to `flattenPayload(payload)`. Both sides of the comparison
    // run the same walker, so a defect INSIDE the walker moves both sides together and the
    // comparison stays green. Measured: making the walker skip booleans left that test passing —
    // the document lost two cells, the expectation lost the same two, and they agreed.
    //
    // So the walker needs an oracle it did not compute. This list is TRANSCRIBED BY HAND from the
    // capture at `sessions/2026-09-26-capture-from-lane-1-...`, not generated from the fixture,
    // and it is the only assertion here that can indict `flattenPayload` itself.
    //
    // ⚠ THE STRING/NUMBER PAIRS ARE NOT A TRANSCRIPTION SLIP. Every row sends the same quantity
    // twice — `amount` "604963.20" beside `contribution` 604963.2, `share_of_purchased`
    // "0.4100" beside `share_of_total` 0.41. They must land as DIFFERENT text, because that is
    // what the producer sent; a list that tidied them into one spelling would agree with a
    // builder that had normalised them.
    expect(flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD)).toEqual([
      { path: "archetype", value: "CONTRIBUTION_RANKING" },

      { path: "rows[0].above_threshold", value: "true" },
      { path: "rows[0].amount", value: "604963.20" },
      { path: "rows[0].contribution", value: "604963.2" },
      { path: "rows[0].entity_id", value: "Cobalt Components" },
      { path: "rows[0].entity_name", value: "Cobalt Components" },
      { path: "rows[0].rank", value: "1" },
      { path: "rows[0].share_of_purchased", value: "0.4100" },
      { path: "rows[0].share_of_total", value: "0.41" },
      { path: "rows[0].supplier", value: "Cobalt Components" },
      { path: "rows[0].value_unit", value: "USD" },

      { path: "rows[1].above_threshold", value: "true" },
      { path: "rows[1].amount", value: "398390.40" },
      { path: "rows[1].contribution", value: "398390.4" },
      { path: "rows[1].entity_id", value: "Amber Fabrication" },
      { path: "rows[1].entity_name", value: "Amber Fabrication" },
      { path: "rows[1].rank", value: "2" },
      { path: "rows[1].share_of_purchased", value: "0.2700" },
      { path: "rows[1].share_of_total", value: "0.27" },
      { path: "rows[1].supplier", value: "Amber Fabrication" },
      { path: "rows[1].value_unit", value: "USD" },

      { path: "rows[2].above_threshold", value: "false" },
      { path: "rows[2].amount", value: "280348.80" },
      { path: "rows[2].contribution", value: "280348.8" },
      { path: "rows[2].entity_id", value: "Sable Castings" },
      { path: "rows[2].entity_name", value: "Sable Castings" },
      { path: "rows[2].rank", value: "3" },
      { path: "rows[2].share_of_purchased", value: "0.1900" },
      { path: "rows[2].share_of_total", value: "0.19" },
      { path: "rows[2].supplier", value: "Sable Castings" },
      { path: "rows[2].value_unit", value: "USD" },

      { path: "rows[3].above_threshold", value: "false" },
      { path: "rows[3].amount", value: "191817.60" },
      { path: "rows[3].contribution", value: "191817.6" },
      { path: "rows[3].entity_id", value: "Verdigris Electronics" },
      { path: "rows[3].entity_name", value: "Verdigris Electronics" },
      { path: "rows[3].rank", value: "4" },
      { path: "rows[3].share_of_purchased", value: "0.1300" },
      { path: "rows[3].share_of_total", value: "0.13" },
      { path: "rows[3].supplier", value: "Verdigris Electronics" },
      { path: "rows[3].value_unit", value: "USD" },

      { path: "scope_label", value: "Lot 4" },
      { path: "source_persona", value: "COST_ANALYST" },
      { path: "subject_concept", value: "null" },
      { path: "threshold", value: "0.25" },
      { path: "threshold_defaulted", value: "true" },
      { path: "value_label", value: "Purchased value" },
      { path: "value_unit", value: "USD" },
    ]);
  });

  it("the declared tuple, field by field, against what this capture actually carries", () => {
    // THIS IS THE ORDER'S REPORT, AS AN ASSERTION. The projector declares six fields for this
    // archetype (`agent_fleet/presentation_agent/main.py:752`). Five arrived and one did not, and
    // the fixture header says so in prose — prose that nothing checks. So it is checked here,
    // BOTH DIRECTIONS, because the two failures are different bugs:
    //
    //   a field going missing   → the producer stopped sending something we render
    //   a field appearing       → `verdict` arrived at last, and the header is now stale
    //
    // The previous spelling of this seal asserted only that `threshold` was ABSENT — the
    // never-observed third state. It is observed now. An absence assertion that has become false
    // is the one kind that cannot quietly widen, which is why it was written that way.
    const paths = new Set(flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD).map((c) => c.path));

    for (const declared of ["value_label", "value_unit", "scope_label", "threshold", "threshold_defaulted"]) {
      expect(paths, `declared field ${declared} is no longer on the wire`).toContain(declared);
    }
    // Declared and still not sent. When this goes red, the capture gained a verdict — widen the
    // leaf oracle above and re-read the fixture header rather than deleting this line.
    expect(paths).not.toContain("verdict");

    // And two fields the tuple does NOT declare arrived anyway, so the tuple is not an
    // exhaustive account of the envelope. Asserted so that "undeclared" stays measured.
    expect(paths).toContain("source_persona");
    expect(paths).toContain("subject_concept");

    // THE BOUND IS THE ENGINE'S DEFAULT, NOT AN ANSWER'S CHOICE — and it arrived as a STRING
    // beside a boolean. A consumer that did `threshold > 0.3` would compare a string.
    expect(LOT4_CONTRIBUTION_RANKING_PAYLOAD.threshold).toBe("0.25");
    expect(typeof LOT4_CONTRIBUTION_RANKING_PAYLOAD.threshold).toBe("string");
    expect(LOT4_CONTRIBUTION_RANKING_PAYLOAD.threshold_defaulted).toBe(true);
  });

  it("the verbatim seal can fail — a dropped row and an altered value are both caught", () => {
    const html = buildCardExportHtml(input());
    const expected = flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD);

    // A row removed. Cardinality catches this; containment would not.
    const oneFewer = html.replace(
      /<tr><td class="cx-path" data-cx-path="rows\[1\]\.contribution"[\s\S]*?<\/tr>/,
      "",
    );
    expect(readPayloadTable(oneFewer)).not.toHaveLength(expected.length);

    // A value altered in place. Count is unchanged, so only the pairwise compare sees it.
    // Drawn from the real capture: one cent off the second supplier's contribution.
    const altered = html.replace(">398390.4<", ">398390.5<");
    expect(altered).not.toBe(html);
    const alteredCells = readPayloadTable(altered);
    expect(alteredCells).toHaveLength(expected.length);
    expect(alteredCells).not.toEqual(expected);
  });

  it("values pass through no formatter — the duplicated quantity survives in both spellings", () => {
    // ⛔ THE WITNESS CHANGED WHEN THE DATA BECAME REAL, AND THE OLD ONE HAS NO REFERENT.
    //
    // This seal used to watch a signed integer (`-800000`) and a bare ratio. The real capture
    // carries NO NEGATIVE NUMBER AT ALL — purchased value is never negative — so a
    // signed-integer assertion here would be an assertion about a composed fixture pretending to
    // be an assertion about the export. The sign path still has a witness; it lives on the
    // retired rows, which is part of why they were kept.
    //
    // The real capture hands this seal a STRONGER witness than the one it lost. Each row sends
    // the same quantity twice, once as a string with trailing zeros and once as a number:
    //
    //     amount "604963.20"   contribution 604963.2
    //     share_of_purchased "0.4100"   share_of_total 0.41
    //
    // Any formatter — `toFixed`, `Number()`, a locale call, a trim of trailing zeros — collapses
    // one onto the other. So the pair failing to differ IS the formatter, and it needs no guess
    // about what the formatted output would look like.
    const html = buildCardExportHtml(input());
    const byPath = new Map(readPayloadTable(html).map((c) => [c.path, c.value]));

    expect(byPath.get("rows[0].amount")).toBe("604963.20");
    expect(byPath.get("rows[0].contribution")).toBe("604963.2");
    expect(byPath.get("rows[0].amount")).not.toBe(byPath.get("rows[0].contribution"));

    expect(byPath.get("rows[0].share_of_purchased")).toBe("0.4100");
    expect(byPath.get("rows[0].share_of_total")).toBe("0.41");
    expect(byPath.get("rows[0].share_of_purchased")).not.toBe(byPath.get("rows[0].share_of_total"));

    // Both boolean values, because `String(false)` and a dropped falsy leaf render differently
    // only if something asserts on the false one.
    expect(byPath.get("rows[0].above_threshold")).toBe("true");
    expect(byPath.get("rows[2].above_threshold")).toBe("false");

    // A null the producer sent, not a key it omitted.
    expect(byPath.get("subject_concept")).toBe("null");
  });

  it("carries at least one value the drawn card does not — which is why the table exists", () => {
    // The card formats for a reader; the table keeps the producer's value. If every verbatim
    // value already appeared in the card markup, section 2 would be duplication and this
    // module's premise would be wrong. Asserted as a property, not against a guessed format.
    const cells = flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD);
    const notInCard = cells.filter((c) => !CARD_HTML.includes(c.value));
    expect(notInCard.length).toBeGreaterThan(0);

    const html = buildCardExportHtml(input());
    const byPath = new Map(readPayloadTable(html).map((c) => [c.path, c.value]));
    for (const c of notInCard) expect(byPath.get(c.path)).toBe(c.value);
  });

  it("exports the payload in full even for a payload the card refuses to draw", () => {
    // The export is evidence independent of the card's willingness to render. A refused payload
    // is exactly when someone needs the values, so this is the case that must not degrade.
    const refused = { archetype: "CONTRIBUTION_RANKING", rows: [], scope_label: "Lot 4" };
    const html = buildCardExportHtml(input({ payload: refused, cardHtml: null }));
    expect(readPayloadTable(html)).toEqual(flattenPayload(refused));
    // `rows: []` is a leaf, not a silence — an empty collection the producer sent is a fact.
    expect(readPayloadTable(html)).toEqual(
      expect.arrayContaining([{ path: "rows", value: "[]" }]),
    );
  });

  it("escaping is not corruption — markup-shaped values round-trip as text", () => {
    const nasty = { note: `<b>&"' 5 < 6</b>`, empty_obj: {}, nulled: null };
    const html = buildCardExportHtml(input({ payload: nasty }));
    expect(readPayloadTable(html)).toEqual(flattenPayload(nasty));
    // The raw angle bracket must not have reached the document as markup.
    expect(html).not.toContain(`<b>&"'`);
  });

  it("distinguishes a producer null from a missing key", () => {
    const cells = flattenPayload({ a: null, b: undefined });
    expect(cells).toEqual([
      { path: "a", value: "null" },
      { path: "b", value: "undefined" },
    ]);
  });
});

describe("the method block — rendered when present, said when absent", () => {
  it("absent method renders the sentence, and the section is not blank", () => {
    const html = buildCardExportHtml(input({ method: null }));
    const body = sectionText(html, "How the producer computed this");
    expect(body).toContain(METHOD_ABSENT_SENTENCE);
    // "Not a blank" is the actual claim, so it is asserted directly rather than implied by the
    // sentence being present — a renderer could emit both the sentence and an empty region.
    expect(body.length).toBeGreaterThan(METHOD_ABSENT_SENTENCE.length);
    expect(parse(html).querySelector('[data-cx-method="absent"]')).not.toBeNull();
    expect(parse(html).querySelector('[data-cx-method="present"]')).toBeNull();
  });

  it("invents nothing when the method is absent — no formula appears anywhere", () => {
    const html = buildCardExportHtml(input({ method: null }));
    expect(html).not.toContain(LOT4_METHOD_PRESENT.formula);
    expect(sectionText(html, "How the producer computed this")).not.toContain("=");
  });

  it("present method renders formula, inputs, units and bound", () => {
    const html = buildCardExportHtml(input({ method: LOT4_METHOD_PRESENT }));
    const body = sectionText(html, "How the producer computed this");
    expect(body).toContain(LOT4_METHOD_PRESENT.formula);
    for (const i of LOT4_METHOD_PRESENT.inputs) {
      expect(body).toContain(i.name);
      expect(body).toContain(String(i.value));
      // The unit travels with the input or is visibly absent. `toContain(i.unit)` alone would be
      // satisfied by "USD" appearing once anywhere in the section, so the null case is asserted as
      // the mark rather than left to the absence of a string.
      if (i.unit !== null) expect(body).toContain(i.unit);
    }
    expect(body).toContain(LOT4_METHOD_PRESENT.boundUnreadable as string);
    expect(body).not.toContain(METHOD_ABSENT_SENTENCE);
    expect(parse(html).querySelector('[data-cx-method="present"]')).not.toBeNull();
  });

  it("REFUSES a formula with nothing behind it — that shape is a data row", () => {
    // Was: this read to `{formula, inputs: [], bound: null}` and rendered the formula with two
    // absence marks. Withdrawn 2026-09-26 by ruling, because a finance row is that same object —
    // a formula and no inputs — so accepting it made every row a block. See the reader's own
    // comment for why the requirement is keyed on the inputs rather than on row spelling.
    expect(readMethod({ formula: "EAC = AC + (BAC - EV)" })).toBeNull();
    // And the inputs have to NAME something: a list of anonymous values is the same non-claim.
    expect(readMethod({ formula: "f", inputs: [{ value: 3 }] })).toBeNull();
    expect(readMethod({ formula: "f", inputs: [] })).toBeNull();
    expect(readMethod({ formula: "f", inputs: {} })).toBeNull();
    // The control, so the guard is not simply refusing everything: ONE named input is enough.
    expect(readMethod({ formula: "f", inputs: [{ name: "BAC", value: 3 }] })).not.toBeNull();
  });

  it("the RENDERER still says absent for an empty block — now only constructible by hand", () => {
    // Kept deliberately after the reader stopped producing this shape. The renderer's job is
    // unchanged and is a different subject: given a block with no inputs and no bound it must
    // print the absence marks rather than a bare formula with two blanks. Built as a literal,
    // which is the point — `readMethod` can no longer hand this out.
    const m: MethodBlock = {
      formula: "EAC = AC + (BAC - EV)",
      inputs: [],
      bound: null,
      boundUnreadable: null,
      bound_defaulted: null,
      producer_sha: null,
    };
    const body = sectionText(
      buildCardExportHtml(input({ method: m })),
      "How the producer computed this",
    );
    expect(body).toContain("EAC = AC + (BAC - EV)");
    expect(body).toContain(`inputs: ${ABSENT_MARK}`);
    expect(body).toContain(`bound: ${ABSENT_MARK}`);
    // The three fields added 2026-09-27 take the same treatment in this shape: each states its own
    // absence rather than vanishing, and `bound_defaulted` says NOT STATED rather than "absent",
    // because a tri-state's third state is a reading and not a missing field.
    expect(body).toContain(`bound_defaulted: ${NOT_STATED_MARK}`);
    expect(body).toContain(`producer_sha: ${ABSENT_MARK}`);
  });

  it("drops a formula-less block whole — the formula is the claim", () => {
    expect(readMethod({ inputs: [{ name: "BCWP", value: 1 }], bound: ">0" })).toBeNull();
    expect(readMethod({ formula: "   " })).toBeNull();
    expect(readMethod(null)).toBeNull();
    expect(readMethod("EAC = AC + ETC")).toBeNull();
    expect(readMethod([{ formula: "x" }])).toBeNull();
  });

  it("keeps falsy input values — a zero is an answer, not an absence", () => {
    const m = readMethod({
      formula: "f",
      inputs: [
        { name: "sv", value: 0 },
        { name: "loe", value: false },
        { name: "note", value: "" },
        { value: "no name here" },
      ],
    });
    // ⛔ THE TYPES, NOT JUST THE PRESENCE. `0` is a number and `false` is a boolean — they used to
    // arrive here as the strings "0" and "false", which is the loss the wire mirror names: a reader
    // handed `"false"` cannot tell it from a producer that sent the word. `toEqual` distinguishes
    // them, so this arm is also the seal on type preservation for the falsy values, where a
    // stringifier is least visible.
    expect(m?.inputs).toEqual([
      { name: "sv", value: 0, unit: null },
      { name: "loe", value: false, unit: null },
      { name: "note", value: "", unit: null },
    ]);
  });

  it("reads inputs given as an object as well as an array", () => {
    const m = readMethod({ formula: "f", inputs: { BCWP: 2200000, ACWP: 3000000 } });
    // `unit: null` by CONSTRUCTION in this shape, not by a reading — `{name: value}` has nowhere to
    // put one. Asserted so the difference between the two accepted shapes is written down where
    // someone comparing them will look.
    expect(m?.inputs).toEqual([
      { name: "BCWP", value: 2200000, unit: null },
      { name: "ACWP", value: 3000000, unit: null },
    ]);
  });

  /**
   * ⛔ WHAT THIS SIDE CARRIES FROM THE PRODUCER'S BLOCK — five fields, measured not assumed.
   *
   * Every other test in this describe feeds `readMethod` a block composed on this side, so all of
   * them agree with the reader about which fields exist. `LOT4_PRODUCER_METHOD_RAW` carries the
   * producer's OWN field names and types, so it is the only input here that can show a field
   * arriving and going nowhere.
   *
   * ── THIS ARM WAS THE REPORT, AND IT IS NOW THE SEAL ───────────────────────────────────────
   *
   * Until 2026-09-27 it was titled "drops bound_defaulted, producer_sha and each input's unit —
   * the three cortex-side gaps", and its header said: "NOTHING IS PATCHED. No order covers widening
   * `MethodBlock` ... it goes red the day someone closes it, which is when the header above needs
   * rewriting." An order covered it, the gap is closed, and this is that rewrite. The header is
   * replaced rather than annotated, because a stale ⚠ describing a gap that no longer exists is the
   * failure this file warns about two describes down.
   *
   * What it now asserts is the OPPOSITE claim over the same input, which is why it stayed one arm
   * instead of being deleted and replaced: the fixture, the controls and the subject are unchanged,
   * so a reader can see that the thing once measured as lost is the thing now measured as carried.
   */
  it("carries bound_defaulted, producer_sha and each input's unit — the three gaps, closed", () => {
    const raw = LOT4_PRODUCER_METHOD_RAW;
    // THE CONTROLS FIRST: the fields must be present on the way IN, or "carried" is a claim about
    // a fixture that never carried them — which passes just as well over a reader that drops them.
    expect(raw.bound_defaulted).toBe(true);
    expect(raw.producer_sha).toBeTruthy();
    expect(raw.inputs.filter((i) => "unit" in i)).toHaveLength(1);

    const m = readMethod(raw);
    expect(m).not.toBeNull();

    expect(m?.formula).toBe(raw.formula);
    expect(m?.inputs).toHaveLength(5);
    // ⛔ A NUMBER, NOT THE STRING "0.25". The producer sends a float and the reader used to be the
    // narrowing; `toBe(0.25)` fails on `"0.25"` and is therefore the arm that notices a
    // stringifier coming back.
    expect(m?.bound).toBe(0.25);
    expect(m?.boundUnreadable).toBeNull();
    // TRUE, not truthy: `toBe(true)` fails on `"true"` and on `1`, which a `!!` read would produce.
    expect(m?.bound_defaulted).toBe(true);
    expect(m?.producer_sha).toBe(raw.producer_sha);

    // THE KEY CENSUS, both directions. Written as an equality over the whole key set rather than
    // five `toBeDefined()` checks, because a set of present-checks cannot see a field the reader
    // stops emitting later, and cannot see one it invents either.
    const parsed = m as unknown as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "boundUnreadable",
      "bound",
      "bound_defaulted",
      "formula",
      "inputs",
      "producer_sha",
    ].sort());
    // THE UNIT, PER INPUT, against the producer's own key rather than against a list written here.
    // `"unit" in i` on the raw side is the population: whatever the fixture states, the block must
    // state, and whatever it does not state must read as `null` and not as a missing key.
    expect(m?.inputs.map((i) => Object.keys(i).sort())).toEqual(
      raw.inputs.map(() => ["name", "unit", "value"]),
    );
    for (const [n, i] of (m?.inputs ?? []).entries()) {
      const rawInput = raw.inputs[n] as { unit?: string };
      expect(i.unit).toBe("unit" in rawInput ? rawInput.unit : null);
    }

    // AND WHAT THAT BUYS ON SCREEN — the reader and the renderer together, because a wider reader
    // with no renderer is the silent half-fix the old header named as the reason not to widen one
    // without the other.
    const html = buildCardExportHtml(input({ method: readMethod(raw) }));
    const methodSection = sectionText(html, "How the producer computed this");
    expect(methodSection).toContain("0.25");
    // `bound_defaulted` was the only thing that could say whether 0.25 was the caller's choice or
    // the engine's default. It now says so, in the section a reader recomputing the formula reads.
    expect(methodSection).toContain("bound_defaulted");
    expect(methodSection).toContain("the producer's own default");
    expect(methodSection).toContain(raw.producer_sha);
    // The unit arrives beside its input. Asserted on the method section alone, because `value_unit`
    // puts USD elsewhere on the page and a whole-page assertion would pass for an unrelated reason.
    expect(methodSection).toContain("1475520.00");
    expect(methodSection).toContain("USD");
    // And the four inputs the producer did NOT annotate are marked absent rather than blank.
    const unannotated = raw.inputs.filter((i) => !("unit" in i)).length;
    expect(unannotated).toBe(4);
    expect(methodSection.split(ABSENT_MARK).length - 1).toBeGreaterThanOrEqual(unannotated);
  });
});

/**
 * THE ROW SHAPE THE FLEET SENDS vs THE ROW SHAPE THIS SIDE DECLARES.
 *
 * `cardExport.fixture.ts`'s header states the divergence in both directions and says it is
 * asserted here. This is that assertion — written because THE HEADER CANNOT CHECK ITSELF, and a
 * comment describing a measured hole ages into a comment describing a hole that was filled.
 *
 * ⚠ WHY A SOURCE READ AND NOT A TYPE. `ContributionRow` is an interface: it has no runtime
 * value, so there is nothing to enumerate at test time. A `satisfies` or a keyof dance would
 * check the fixture against the type — the opposite of what is wanted, since the point is that
 * the two DISAGREE and the fixture must be allowed to. So the declared field list is extracted
 * from the contract's own text, the same live-read idiom `projectedTupleParity.test.ts` uses.
 *
 * A regex over source can return nothing and read as "no divergence", so the extraction carries
 * its own controls below before any divergence is asserted.
 */
describe("the wire row against the declared row — both directions", () => {
  const CONTRACT_PATH = path.join(
    __dirname,
    "..",
    "components",
    "planning",
    "ContributionRanking.contract.ts",
  );

  /** The field names of `interface ContributionRow`, read off the contract's own text. */
  function declaredRowFields(): string[] {
    const src = readFileSync(CONTRACT_PATH, "utf8");
    const open = src.indexOf("export interface ContributionRow {");
    if (open < 0) return [];
    const body = src.slice(open, src.indexOf("\n}", open));
    // Comments stripped first as a precaution — and MEASURED, not assumed: on today text the
    // strip changes nothing, both spellings return the same ten fields. It is kept because the
    // hazard is real in kind (a doc comment holding `e.g. note: ...` would be harvested as a
    // field) and because a divergence list is exactly where one stray word reads as a real
    // finding. Recorded as measured so nobody later cites it as a caught defect.
    const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    return Array.from(stripped.matchAll(/^\s*(\w+)\??\s*:/gm), (m) => m[1]);
  }

  const declared = declaredRowFields();
  const onWire = Object.keys(LOT4_WIRE_ROWS[0]);

  it("the extraction resolved — a silent zero would report no divergence at all", () => {
    // THE CONTROL, AND IT COMES FIRST. If the interface is renamed or the file moves, every
    // assertion below would pass vacuously: an empty declared list makes every wire field
    // "undeclared" and leaves nothing "declared but absent" to find.
    expect(declared.length, "the contract read found no fields — the path or the regex is wrong").toBeGreaterThanOrEqual(6);
    expect(declared).toContain("entity_id");
    expect(declared).toContain("favourable");
    // And the wire side, for the same reason.
    expect(onWire.length).toBeGreaterThanOrEqual(6);
    expect(onWire).toContain("contribution");
  });

  it("every row on the wire carries the same keys — a per-row shape, not a union", () => {
    // Asserted before the divergence, because reading row 0 and calling it "the wire shape" is
    // the population mistake: a field present on one row only would be invisible here and would
    // make both lists below wrong.
    for (const r of LOT4_WIRE_ROWS) {
      expect(Object.keys(r).sort()).toEqual([...onWire].sort());
    }
  });

  it("on the wire and NOT declared by our contract", () => {
    const undeclared = onWire.filter((k) => !declared.includes(k)).sort();
    expect(undeclared).toEqual([
      "above_threshold",
      "amount",
      "rank",
      "share_of_purchased",
      "supplier",
      "value_unit",
    ]);
    // `above_threshold` is the one that costs something: it is the flag a card needs to mark the
    // rows over the bound, and this side has no field for it. Named on its own so that the day
    // the contract grows it, THIS line is what goes red rather than a count.
    expect(undeclared).toContain("above_threshold");
  });

  it("declared by our contract and ABSENT from the wire", () => {
    const missing = declared.filter((k) => !onWire.includes(k)).sort();
    expect(missing).toEqual(["acwp", "bcwp", "bcws", "favourable", "note", "variance_kind"]);
    // `favourable` is the measured hole. The contract says the sign's meaning must not be
    // inferred and is the producer's to state; on this payload the producer does not state it.
    // Inferring from `contribution > 0` is the exact thing the contract forbids, so this
    // absence is load-bearing, not incidental.
    expect(missing).toContain("favourable");
    expect(LOT4_WIRE_ROWS.every((r) => !("favourable" in r))).toBe(true);
  });

  it("the two shapes do overlap — otherwise the card could render nothing at all", () => {
    const shared = onWire.filter((k) => declared.includes(k)).sort();
    expect(shared).toEqual(["contribution", "entity_id", "entity_name", "share_of_total"]);
  });

  it("the retired rows are the only witness left for the absence branches", () => {
    // WHY `RETIRED_SHAPE_ONLY_ROWS` WAS KEPT RATHER THAN DELETED. The real capture carries no
    // `favourable`, `bcws`, `bcwp` or `acwp` on ANY row, so it cannot reach the card's
    // optional-field absence attributes or its do-not-infer-the-sign path. Deleting the retired
    // rows would drop that coverage and every suite would stay green.
    const evmBearing = RETIRED_SHAPE_ONLY_ROWS.filter((r) => r.bcws !== undefined);
    expect(evmBearing).toHaveLength(1);
    expect(RETIRED_SHAPE_ONLY_ROWS.some((r) => r.favourable === true)).toBe(true);
    expect(RETIRED_SHAPE_ONLY_ROWS.some((r) => r.favourable === false)).toBe(true);
    // And the real rows genuinely cannot stand in for them.
    expect(LOT4_WIRE_ROWS.some((r) => "bcws" in r)).toBe(false);
  });
});

describe("provenance", () => {
  it("renders all six lines — four captured values and two absences the capture earned", () => {
    // ⛔ TWO OF THE SIX ARE NOW `absent`, AND THAT IS THE CORRECT OUTPUT, NOT A GAP HERE.
    //
    // The previous version of this test asserted a `roll sha` of "c0005142" and a timestamp.
    // Neither is in this capture: there is no `fleet_sha` anywhere in those bytes and no answer
    // timestamp. The old values were lifted from a DIFFERENT capture's payload, which made a
    // derivation read as a measurement — so the fixture now carries nulls and the export renders
    // the absence mark.
    //
    // An export that invented a sha would be worse than one that says it does not know: the sha
    // is what a reader would use to say which roll produced the answer.
    const doc = parse(buildCardExportHtml(input()));
    const get = (k: string) =>
      doc.querySelector(`[data-cx-prov="${k}"]`)?.textContent?.trim() ?? null;
    expect(get("persona")).toBe("COST_ANALYST");
    expect(get("verb")).toBe("cost Supplier Concentration");
    expect(get("engine")).toBe("iagent-engine-cost");
    expect(get("roll sha")).toBe(ABSENT_MARK);
    expect(get("timestamp")).toBe(ABSENT_MARK);
    expect(get("question asked")).toBe("how concentrated is purchasing on lot 4");

    // Six lines rendered, not four — a null must not drop the row, or the reader cannot tell
    // "the export has no sha" from "this export has no sha LINE".
    expect(doc.querySelectorAll("[data-cx-prov]")).toHaveLength(6);
  });

  it("says absent for each line the artifact did not carry — never a blank cell", () => {
    const html = buildCardExportHtml(
      input({
        provenance: {
          persona: null,
          verb: null,
          engine: null,
          roll_sha: null,
          timestamp: null,
          question_asked: null,
        },
      }),
    );
    const doc = parse(html);
    const cells = Array.from(doc.querySelectorAll("[data-cx-prov]"));
    expect(cells).toHaveLength(6);
    for (const c of cells) expect(c.textContent?.trim()).toBe(ABSENT_MARK);
  });
});

describe("reading provenance off an artifact", () => {
  const full = {
    created_at: 1758240000000,
    question_text: "which account is driving the overrun on NP-MERIDIAN",
    produced_by: { code_hash: "c0005142", version: "1.4.0" },
    produced_for: { user_persona: "PROGRAM_MANAGER" },
    routing: {
      action: { label: "fin Variance Analysis" },
      handled_by: { engine_name: "iagent-engine-fin" },
      acting: { persona: "PROGRAM_FINANCE_ANALYST" },
    },
  };

  it("prefers the persona the request acted AS over the user's own", () => {
    // These two disagree on purpose. They agree on most rows, which is exactly why a test where
    // they matched would not establish which one is being read.
    expect(readExportProvenance(full).persona).toBe("PROGRAM_FINANCE_ANALYST");
    expect(readExportProvenance({ ...full, routing: { ...full.routing, acting: null } }).persona)
      .toBe("PROGRAM_MANAGER");
  });

  it("prefers code_hash over version for the roll sha", () => {
    expect(readExportProvenance(full).roll_sha).toBe("c0005142");
    expect(readExportProvenance({ ...full, produced_by: { version: "1.4.0" } }).roll_sha)
      .toBe("1.4.0");
    expect(readExportProvenance({ ...full, produced_by: null }).roll_sha).toBeNull();
  });

  it("reads created_at as epoch milliseconds", () => {
    expect(readExportProvenance(full).timestamp).toBe(new Date(1758240000000).toISOString());
    // Seconds-scaled or zero input would land in 1970 or earlier; both are rejected rather than
    // rendered as a date nobody can distinguish from a real one.
    expect(readExportProvenance({ created_at: 0 }).timestamp).toBeNull();
    expect(readExportProvenance({}).timestamp).toBeNull();
  });

  it("returns null for every field an empty artifact does not carry", () => {
    expect(readExportProvenance({})).toEqual({
      persona: null,
      verb: null,
      engine: null,
      roll_sha: null,
      timestamp: null,
      question_asked: null,
    });
  });

  it("treats a whitespace-only field as absent, not as a value", () => {
    const blank = readExportProvenance({
      question_text: "   ",
      routing: { action: { label: "" }, handled_by: { engine_name: " " }, acting: null },
    });
    expect(blank.question_asked).toBeNull();
    expect(blank.verb).toBeNull();
    expect(blank.engine).toBeNull();
  });
});

describe("self-contained", () => {
  it("references nothing over the network", () => {
    const html = buildCardExportHtml(input({ css: "body { color: red }" }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("inlines the page CSS, and says so when it could not be read", () => {
    expect(buildCardExportHtml(input({ css: "body{color:red}" }))).toContain("body{color:red}");
    const body = sectionText(buildCardExportHtml(input({ css: null })), "The card as rendered");
    expect(body).toContain("could not be read");
  });

  it("embeds the card markup, including every absence attribute it declares", () => {
    // The card's seven `data-*` absence attributes are its own account of what the payload did
    // not carry. An export that kept the pixels and dropped these would lose the most checkable
    // thing on the card. WHICH ones this payload triggers is the card's contract, sealed in its
    // own tests; this asserts that whatever it declared arrives intact, and that the set is not
    // empty — a comparison between two empty sets would pass while measuring nothing.
    //
    // THE COMPLETE FIXTURE IS THE WRONG INPUT FOR THIS SEAL and the non-empty guard is what said
    // so: a payload carrying every field declares no absences, so against it this test compared
    // nothing to nothing and passed. The rows below drop `favourable`, which is what makes the
    // card emit `data-no-verdict`, so there is something for the export to lose.
    // ⛔ THE RETIRED ROWS, ON PURPOSE. The real capture carries no `favourable` at ALL, so it
    // cannot be stripped to produce this state — and it carries no `bcws`/`bcwp`/`acwp` either,
    // so most absence attributes would fire at once and stop distinguishing anything. The
    // shape-only rows are kept precisely for the branches real data cannot reach.
    const unjudged = RETIRED_SHAPE_ONLY_ROWS.map(
      ({ favourable: _drop, ...rest }: (typeof RETIRED_SHAPE_ONLY_ROWS)[number]) => rest,
    );
    const cardWithAbsences = renderToStaticMarkup(
      <ContributionRanking rows={unjudged} scope_label="Lot 4" />,
    );
    const declaredInCard = (cardWithAbsences.match(/data-[a-z-]+=/g) ?? []).sort();
    expect(declaredInCard.length).toBeGreaterThan(0);

    const frame = parse(
      buildCardExportHtml(input({ cardHtml: cardWithAbsences })),
    ).querySelector(".cx-card-frame");
    expect(frame).not.toBeNull();
    const declaredInExport = (frame!.innerHTML.match(/data-[a-z-]+=/g) ?? []).sort();
    expect(declaredInExport).toEqual(declaredInCard);
  });

  it("strips anything executable out of captured markup", () => {
    // The script body is deliberately NOT a call to `fetch`. The transport-declaration guard is a
    // line regex and it flagged this literal as an undeclared transport site — a false positive
    // that is the exact mirror of the false negative already recorded against `client.ts`. Neither
    // is worth weakening: a guard that reads text cannot know what is a call, and the cheap answer
    // is to not write a fake one. Declaring a transport exception here would have put a site that
    // does not exist into the register that is supposed to list the ones that do.
    const dirty = `<div onclick="steal()"><script>alert(document.cookie)</script><p>kept</p></div>`;
    const cleaned = stripExecutable(dirty);
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/onclick/i);
    expect(cleaned).toContain("<p>kept</p>");
    const html = buildCardExportHtml(input({ cardHtml: dirty }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onclick/i);
  });

  it("says so when no card markup was captured, rather than drawing an empty frame", () => {
    const body = sectionText(buildCardExportHtml(input({ cardHtml: null })), "The card as rendered");
    expect(body).toContain("card markup was not captured");
  });
});

describe("the file itself", () => {
  it("is a complete document titled after the card", () => {
    const html = buildCardExportHtml(input());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(parse(html).title).toBe("Lot 4 · supplier concentration");
    expect(html).toContain("CONTRIBUTION_RANKING");
  });

  it("names the archetype absent rather than guessing one", () => {
    const html = buildCardExportHtml(input({ archetype: null }));
    expect(html).toContain(`archetype ${ABSENT_MARK}`);
  });

  it("builds a filename that sorts by time and carries no path characters", () => {
    const name = exportFileName("Lot 4 · cost variance", new Date("2026-09-24T02:03:04.567Z"));
    expect(name).toBe("lot-4-cost-variance-2026-09-24T02-03-04-567.html");
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("is pure — the same input builds the same bytes", () => {
    expect(buildCardExportHtml(input())).toBe(buildCardExportHtml(input()));
  });
});

/**
 * ⛔ THE READER AGAINST ca's OWN EXECUTED DUMP — the fixture the 2026-09-27 order names.
 *
 * Every other arm in this file feeds `readMethod` a block written on this side, including
 * `LOT4_PRODUCER_METHOD_RAW`, which is TRANSCRIBED from producer source and says so. A
 * transcription can be faithful and still be a claim about what someone typed. This block is
 * neither: it is the JSON ca got back from `MethodBlock(...).model_dump(mode="json")` and pasted
 * into the packet, so it is the only method block in this repo that a producer process actually
 * emitted.
 *
 * ── WHY IT IS A `.json` FILE AND NOT THE FENCE IN THE PACKET ──────────────────────────────────
 *
 * It arrived inside a `.md`, where every fixture sweep in this repo is blind to it: the glob is
 * `sessions/*payload*.json`, and a capture in the wrong file type has already cost this lane a
 * seal that stayed green the day it became false. So the dump is extracted to
 * `methodBlockPacketCapture.json` and imported like any other fixture — and the FIRST arm below
 * reads the packet's fence back and compares it, so the extraction cannot drift from the packet it
 * claims to be. Without that arm the JSON file is just another block written on this side, wearing
 * a provenance it cannot prove.
 */
describe("readMethod over the packet's executed dump", () => {
  const PACKET = path.join(
    __dirname,
    "../../sessions",
    "2026-09-26-packet-from-ca-the-ts-mirror-of-completeness-total-available-and-methodblock.md",
  );

  it("the json fixture IS the packet's fenced block — the extraction has not drifted", () => {
    const src = readFileSync(PACKET, "utf8");
    const fences = [...src.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
    // The instrument, asserted before it is used: exactly one json fence. If the packet grows a
    // second one, "the fenced block" stops naming a single thing and this must be re-pointed rather
    // than silently reading the first.
    expect(fences).toHaveLength(1);
    expect(JSON.parse(fences[0])).toEqual(PACKET_METHOD_CAPTURE);
  });

  it("carries every field of the dump, with the dump's own JSON types", () => {
    const m = readMethod(PACKET_METHOD_CAPTURE);
    expect(m).not.toBeNull();
    expect(m?.formula).toBe("share = value / total");
    expect(m?.producer_sha).toBe("abc1234");

    // ⛔ `1475520.0` IS A NUMBER AND `4` IS A NUMBER, and this is the assertion the old reader
    // failed: it handed back the strings "1475520" and "4". `toEqual` is type-strict, so a
    // stringifier reintroduced anywhere between here and the wire fails here first.
    expect(m?.inputs).toEqual([
      { name: "total purchased value", value: 1475520.0, unit: "USD" },
      { name: "lot", value: 4, unit: null },
    ]);

    // The dump states `null` for both, and BOTH nulls are meaningful: no bound stated, and no
    // statement about whose bound it would have been. Neither may read as `false` or as `0`.
    expect(m?.bound).toBeNull();
    expect(m?.boundUnreadable).toBeNull();
    expect(m?.bound_defaulted).toBeNull();
    // `toBeNull` and not `toBeFalsy`: `false` and `0` both satisfy falsiness and both are the
    // defect this field exists to prevent.
    expect(m?.bound_defaulted).not.toBe(false);
  });

  it("renders the dump's unit beside its input, and its two nulls as two different words", () => {
    const body = sectionText(
      buildCardExportHtml(input({ method: readMethod(PACKET_METHOD_CAPTURE) })),
      "How the producer computed this",
    );
    expect(body).toContain("share = value / total");
    expect(body).toContain("1475520");
    expect(body).toContain("USD");
    expect(body).toContain("abc1234");
    // THE TWO ABSENCES ARE SPELLED DIFFERENTLY ON PURPOSE. An unstated bound is `absent`; an
    // unstated `bound_defaulted` is `not stated`, because "the producer set no threshold" and "the
    // producer did not say whose threshold this is" are different facts and one word for both is
    // how a tri-state gets read as a boolean by the person holding the page.
    expect(body).toContain(`bound: ${ABSENT_MARK}`);
    expect(body).toContain(`bound_defaulted: ${NOT_STATED_MARK}`);
    expect(NOT_STATED_MARK).not.toBe(ABSENT_MARK);
  });

  it("the lot input's unit is null in the dump — absent key and explicit null are one state", () => {
    // The dump carries `"unit": null` EXPLICITLY for `lot`, where the producer's own dict omits the
    // key. Both must read as `null`, and the control is that they read the SAME: the SDK's dump and
    // the producer's dict disagree about spelling and agree about the fact.
    const explicit = readMethod(PACKET_METHOD_CAPTURE);
    const omitted = readMethod({
      ...PACKET_METHOD_CAPTURE,
      inputs: [
        { name: "total purchased value", value: 1475520.0, unit: "USD" },
        { name: "lot", value: 4 },
      ],
    });
    expect(omitted?.inputs).toEqual(explicit?.inputs);
    expect(omitted?.inputs[1].unit).toBeNull();
  });
});

/**
 * ⛔ THE BRANCHES ca's DUMP DOES NOT REACH — one case per branch, including the near sides.
 *
 * The packet's capture states `null` for both `bound` and `bound_defaulted`, so on its own it
 * exercises the absent side of each and nothing else. A field whose only test case is its null
 * state is a field whose stated states are untested, and for `bound` the untested state is the one
 * that was WRONG: `m.bound ? ... : absent` drew a bound of `0` as "the producer stated none".
 *
 * That defect could not be caught by any input above. `LOT4_PRODUCER_METHOD_RAW` has `bound: 0.25`
 * and the dump has `null`, and BOTH render correctly under the broken spelling — the values are on
 * either side of the one that breaks it. So the case had to be constructed, which is the shape of
 * this lane's own note about coincidence defects: a bug hidden because two readings agree on
 * ordinary data is only catchable where they diverge.
 */
describe("the method block's stated states, one case per branch", () => {
  const block = (over: Record<string, unknown>) =>
    readMethod({ formula: "f", inputs: [{ name: "x", value: 1 }], ...over });
  const render = (over: Record<string, unknown>) =>
    sectionText(
      buildCardExportHtml(input({ method: block(over) })),
      "How the producer computed this",
    );

  it("⛔ A BOUND OF ZERO IS A BOUND — the truthiness trap, which no real fixture could catch", () => {
    expect(block({ bound: 0 })?.bound).toBe(0);
    expect(block({ bound: 0 })?.boundUnreadable).toBeNull();
    const body = render({ bound: 0 });
    expect(body).toContain("bound: 0");
    // The claim is not merely that "0" appears — it is that the absence mark does NOT. Under the
    // old spelling the section said `bound: absent` while the producer had stated a threshold.
    expect(body).not.toContain(`bound: ${ABSENT_MARK}`);
  });

  it("keeps a negative and a fractional bound, and does not reformat either", () => {
    expect(block({ bound: -100000 })?.bound).toBe(-100000);
    expect(block({ bound: 0.25 })?.bound).toBe(0.25);
    // No thousands separator, no percent, no fixed places — the same rule the payload table lives
    // by. A bound a reader cannot type back into the formula is not provenance.
    expect(render({ bound: -100000 })).toContain("-100000");
  });

  it("converts a NUMERIC STRING bound, because 0.25 and \"0.25\" are one value", () => {
    expect(block({ bound: "0.25" })?.bound).toBe(0.25);
    expect(block({ bound: "0" })?.bound).toBe(0);
    expect(block({ bound: "0.25" })?.boundUnreadable).toBeNull();
  });

  it("⛔ A SENTENCE BOUND IS UNREADABLE, NOT ABSENT — the two must not render alike", () => {
    // This is the shape this repo's own fixture carried before the producer narrowed to a float,
    // so it is not a hypothetical: `|contribution| >= 100000` was a bound someone wrote down.
    const m = block({ bound: "|contribution| >= 100000" });
    expect(m?.bound).toBeNull();
    expect(m?.boundUnreadable).toBe("|contribution| >= 100000");
    const body = render({ bound: "|contribution| >= 100000" });
    expect(body).toContain("|contribution| >= 100000");
    // The page must not claim the producer stated no bound when it stated one this side cannot
    // parse. That is the absent-vs-unreadable confusion, on the field where it costs most.
    expect(body).not.toContain(`bound: ${ABSENT_MARK}`);
  });

  it("a NaN or Infinity bound is unreadable too — `typeof 'number'` is not enough", () => {
    expect(block({ bound: Number.NaN })?.bound).toBeNull();
    expect(block({ bound: Number.NaN })?.boundUnreadable).toBe("NaN");
    expect(block({ bound: Number.POSITIVE_INFINITY })?.bound).toBeNull();
  });

  it("a BLANK bound is absent, not unreadable — there is nothing in it to fail to read", () => {
    expect(block({ bound: "   " })?.bound).toBeNull();
    expect(block({ bound: "   " })?.boundUnreadable).toBeNull();
    expect(render({ bound: "   " })).toContain(`bound: ${ABSENT_MARK}`);
  });

  it("bound_defaulted FALSE is a statement and says so — the near side of the tri-state", () => {
    // The near side, asserted on purpose. Its obvious mutation (`false` → `null`) still renders a
    // line and still contains the word "bound_defaulted", so an arm keyed on the field's NAME
    // reads as covering this and covers nothing.
    expect(block({ bound_defaulted: false })?.bound_defaulted).toBe(false);
    const body = render({ bound_defaulted: false });
    expect(body).toContain("chosen by the caller");
    expect(body).not.toContain(NOT_STATED_MARK);
  });

  it("bound_defaulted TRUE names the producer's default", () => {
    expect(block({ bound_defaulted: true })?.bound_defaulted).toBe(true);
    expect(render({ bound_defaulted: true })).toContain("the producer's own default");
  });

  it("⛔ A NON-BOOLEAN bound_defaulted IS 'DID NOT SAY' — never coerced to a claim", () => {
    // `!!"false"` is `true`, `!!1` is `true`, `!!0` is `false`. Every one of those is a statement
    // about whose bound it is, invented out of a value that stated nothing.
    for (const v of ["true", "false", 1, 0, "", "yes", {}, []]) {
      expect(block({ bound_defaulted: v })?.bound_defaulted).toBeNull();
    }
    expect(render({ bound_defaulted: "true" })).toContain(`bound_defaulted: ${NOT_STATED_MARK}`);
  });

  it("a blank or absent producer_sha is none, and a non-string one is shown not dropped", () => {
    expect(block({ producer_sha: "   " })?.producer_sha).toBeNull();
    expect(block({})?.producer_sha).toBeNull();
    expect(block({ producer_sha: null })?.producer_sha).toBeNull();
    // Off contract upstream (`str`, required), so it is not nulled: "sent nothing" and "sent
    // something odd" are the pair this reader refuses to collapse.
    expect(block({ producer_sha: 1234 })?.producer_sha).toBe("1234");
    expect(render({ producer_sha: " deadbee " })).toContain("deadbee");
  });

  it("a blank unit is no unit STATED — and neither blank nor null means dimensionless", () => {
    const m = readMethod({
      formula: "f",
      inputs: [
        { name: "a", value: 1, unit: "  " },
        { name: "b", value: 1, unit: null },
        { name: "c", value: 1 },
      ],
    });
    expect(m?.inputs.map((i) => i.unit)).toEqual([null, null, null]);
    // Three inputs, three unit cells, all marked — a blank cell would say nothing about whether
    // the producer declined to annotate or this side lost the annotation.
    const body = sectionText(
      buildCardExportHtml(input({ method: m })),
      "How the producer computed this",
    );
    expect(body.split(ABSENT_MARK).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("an off-contract input value is kept as its text, and null keeps its own word", () => {
    const m = readMethod({
      formula: "f",
      inputs: [
        { name: "obj", value: { a: 1 } },
        { name: "nul", value: null },
        { name: "missing" },
      ],
    });
    // The union cannot hold an object, so it becomes text — but it is not DROPPED, and `null` and
    // a missing key stay distinguishable, which is `formatLeaf`'s whole reason for existing.
    expect(m?.inputs.map((i) => i.value)).toEqual(['{"a":1}', "null", "undefined"]);
  });
});
