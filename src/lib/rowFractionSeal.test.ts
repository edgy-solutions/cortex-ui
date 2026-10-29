/**
 * The row-conversion seal — leg B. PLACED by doc-tools/lane/7f, 2026-10-21.
 * Not committed by me: this tree's lane owns its commits.
 *
 * ARCHITECT, 2026-10-21, item 3: *"Seal: one fixture row through the converter,
 * drawn by cortex's reader in both shapes, lands on the same cell."*
 *
 * doc-tools converted the review route's row geometry to page fractions at
 * `d9e6118`, dropping `page_dims` in the SAME commit (items 1 and 2 of that
 * packet). The seal is that the conversion is invisible to this reader: the
 * same cell, before and after.
 *
 * WHY THE SEAL NEEDED TWO LEGS. The converter is Python and this reader is
 * TypeScript, so neither suite can run both halves. doc-tools' leg A
 * (`tests/test_row_fraction_seal.py`) transcribes this reader's rule and runs
 * on every commit there; this file runs the REAL reader. The numbers below are
 * NOT re-derived here — they are the committed fixture
 * (doc-tools `tests/fixtures/sustainment/row_fraction_seal.json`), produced BY
 * their converter, so the two legs cannot quietly diverge by each computing
 * its own expectation. If the legs ever disagree, THIS one is the authority.
 *
 * `OLD_REF` is the pixel form that rows stored before doc-tools `b08468f` carry.
 * The deployed doc-tools (v0.2.2, 7f's measurement, 10-27) no longer writes it,
 * and since platform #121 the published contract refuses it (the leg at the
 * foot of this file). `readEvidence` NO LONGER reads the pixel form (directive
 * 10-28): fractions are the only form, and a stray `page_dims` is ignored. So
 * "before" below is the pixel cell placed by `scaleBox` directly, and the reader
 * is asked only about the fraction form.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { scaleBox, type PageDims } from "./bboxScale";
import { isFractionBox } from "./evidenceRef";
import { readExtraction } from "./promotionReview";

/** 200-DPI US-letter, the space doc-tools ships pixel boxes in. */
const PAGE_DIMS: PageDims = { width: 1700, height: 2200 };

/** What the DEPLOYED producer writes: a parts-table cell in layout pixels. */
const OLD_REF = {
  page: 3,
  bbox: [223, 917, 661, 953],
  page_dims: PAGE_DIMS,
  units: "px",
};

/**
 * doc-tools' `wire_evidence_ref` for that row, verbatim. Page fractions, and NO
 * `page_dims` key — omitted, not nulled, because this reader switches on
 * `Object.hasOwn`. Every edge of the fixture divides inexactly on purpose, so
 * the seal covers their rounding (6 decimal places) and not just exact
 * arithmetic.
 *
 * Per the architect's producer-owns-the-wire-shape ruling (2026-10-21) these
 * are the bytes the BFF now serves unchanged, so this object is no longer a
 * reconstruction of what the route might emit — it is what doc-tools wrote.
 * Lane 1's third leg proves the route passes it through byte-equal.
 */
const NEW_REF = {
  page: 3,
  bbox: [0.131176, 0.416818, 0.388824, 0.433182],
};

/** Their red test renders at two zooms; this one adds a non-integer ratio. */
const RENDER_SIZES = [
  { name: "half", width: 850, height: 1100 },
  { name: "non-integer zoom", width: 1024, height: 1325 },
  { name: "full", width: 1700, height: 2200 },
];

/**
 * A fraction rounded to 6 places carries at most half a unit in the last
 * place; a width is a difference of two, so twice that. Scaled to the rendered
 * page, that is the worst drift the conversion can introduce — ~1e-3 px at
 * full size, three orders below the one-pixel line where an outline could
 * visibly leave the text.
 */
const MAX_FRACTION_ERROR = 0.5e-6;

/** The served review body, reduced to the one row the seal needs. */
function body(ref: unknown) {
  return { rows: [{ mpn: "MC33063ADR2G", row_index: 0, evidence_ref: ref }] };
}

/** Read a served body the way the card does, and place the box. */
function draw(ref: unknown, rendered: { width: number; height: number }) {
  const extraction = readExtraction(body(ref));
  expect(extraction, "readExtraction refused the body").not.toBeNull();
  const evidence = extraction!.rows[0].evidence;
  expect(evidence.state, `this reader refused the ref: ${JSON.stringify(ref)}`).toBe("ok");
  if (evidence.state !== "ok") throw new Error("unreachable");
  const { bbox, page_dims } = evidence.ref;
  expect(bbox, "this ref carries no box to draw").not.toBeNull();
  return scaleBox(bbox!, page_dims, rendered);
}

describe("the row-fraction conversion is invisible to this reader", () => {
  for (const rendered of RENDER_SIZES) {
    it(`lands on the same cell at ${rendered.name} (${rendered.width}x${rendered.height})`, () => {
      const before = scaleBox(OLD_REF.bbox as [number, number, number, number], PAGE_DIMS, rendered);
      const after = draw(NEW_REF, rendered);

      const slack = MAX_FRACTION_ERROR * Math.max(rendered.width, rendered.height);
      for (const key of ["left", "top", "width", "height"] as const) {
        // A width is a difference of two rounded fractions, so twice the slack.
        const tol = slack * (key === "width" || key === "height" ? 2 : 1);
        expect(
          Math.abs(before[key] - after[key]),
          `${key}: ${before[key]} -> ${after[key]}`,
        ).toBeLessThanOrEqual(tol);
      }
    });
  }

  it("drifts sub-pixel, and the bound is stated rather than merely met", () => {
    const rendered = { width: 1700, height: 2200 };
    const before = scaleBox(OLD_REF.bbox as [number, number, number, number], PAGE_DIMS, rendered);
    const after = draw(NEW_REF, rendered);
    const worst = Math.max(
      ...(["left", "top", "width", "height"] as const).map((k) =>
        Math.abs(before[k] - after[k]),
      ),
    );
    expect(worst).toBeLessThan(0.01);
  });

  it("accepts the converted box as a fraction box", () => {
    // A refusal here is not local: it drops the whole list, and the producer
    // sees no error at all.
    expect(isFractionBox(NEW_REF.bbox)).toBe(true);
  });

  it("refuses the pixel form: a pixel bbox with its page_dims is malformed, not drawn", () => {
    const extraction = readExtraction(body(OLD_REF));
    expect(extraction!.rows[0].evidence).toMatchObject({ state: "malformed", reason: "bbox_not_fractions" });
  });

  it("ignores a stray page_dims beside a fraction box: it lands on the same cell, no corner speck", () => {
    // Fractions are the only form, so the dims are not read. (Before 10-28 the dims
    // were taken as the pixel form and the converted box drew as a corner speck.)
    const rendered = { width: 1700, height: 2200 };
    const withDims = draw({ ...NEW_REF, page_dims: PAGE_DIMS }, rendered);
    const without = draw(NEW_REF, rendered);
    expect(withDims).toEqual(without);
    expect(withDims.width).toBeGreaterThan(100);
    expect(withDims.height).toBeGreaterThan(10);
  });
});

/**
 * The several-box row — PLACED 2026-10-21, at your request: *"7f: please make
 * one fixture in leg B's family a several-box row, so cortex's leg covers the
 * union and its note."*
 *
 * The fixture half is `multi_box` in doc-tools
 * `tests/fixtures/sustainment/row_fraction_seal.json`, generated by the
 * converter like the rest of the file.
 *
 * WHAT IS DELIBERATELY NOT HERE: the note caption. Your review-row reader has
 * no `note` today, and you ship it in the same release as the conversion, so a
 * caption assertion placed now would sit red in your tree for reasons that are
 * not a defect. *"Seal: a fixture row with two boxes, read through the real
 * reader, shows the note"* is yours to write with that reader. What is here is
 * the half the producer can be wrong about, and both tests stay green across
 * that release rather than needing an edit when it lands.
 */
const MULTI_PIXEL_BBOXES = [
  [223, 917, 661, 953],
  [189, 959, 587, 995],
];

/** doc-tools' wire ref for that row: the union, and the note it carries. */
const MULTI_REF = {
  page: 3,
  bbox: [0.111176, 0.416818, 0.388824, 0.452273],
  note: "2 boxes",
};

describe("a several-box row reads as its union", () => {
  it("is ACCEPTED although it carries a key this reader does not read", () => {
    // The producer-side risk of the ruling, and the only one it could not see
    // from its own tree: `note` is new on the wire. `readEvidence` says extra
    // keys are not checked (promotionReview.ts:213), so the row reads "ok" and
    // the note is dropped silently rather than taking the row with it. Pinned
    // here because a strict reader would have turned every multi-box row's
    // evidence malformed at once, with nothing logged at the producer.
    const extraction = readExtraction(body(MULTI_REF));
    expect(extraction).not.toBeNull();
    expect(extraction!.rows[0].evidence.state).toBe("ok");
  });

  it("outlines a box that covers EVERY line of the cell, at each zoom", () => {
    // Why the union and not `bboxes[0]`: picking one box would outline a REAL
    // box, so a steward reading a two-line cell would see one line outlined
    // and no sign the other existed — a failure that looks like correct
    // output. The outline is asserted in rendered pixels, where they see it.
    for (const rendered of RENDER_SIZES) {
      const drawn = draw(MULTI_REF, rendered);
      const sx = rendered.width / PAGE_DIMS.width;
      const sy = rendered.height / PAGE_DIMS.height;
      // The union is taken over fractions already rounded to 6 places, so
      // against the raw pixel geometry it can fall one quantum short.
      const slackX = MAX_FRACTION_ERROR * rendered.width;
      const slackY = MAX_FRACTION_ERROR * rendered.height;
      for (const [x0, y0, x1, y1] of MULTI_PIXEL_BBOXES) {
        expect(drawn.left).toBeLessThanOrEqual(x0 * sx + slackX);
        expect(drawn.top).toBeLessThanOrEqual(y0 * sy + slackY);
        expect(drawn.left + drawn.width).toBeGreaterThanOrEqual(x1 * sx - slackX);
        expect(drawn.top + drawn.height).toBeGreaterThanOrEqual(y1 * sy - slackY);
      }
    }
  });
});

/**
 * The CONTRACT leg (architect, 10-27): the evidence_ref schema the BFF publishes is exactly
 * `{page, bbox, note?}` under `additionalProperties: false`. A schema that admits both shapes seals
 * nothing, so this file's refs must resolve both ways: NEW_REF and MULTI_REF accepted, OLD_REF
 * REJECTED, and rejected by a key the contract does not have, not by a missing one. Before Lane 1's
 * #121 (pin b59e4a0f) both were rejected, OLD_REF only for lacking `bboxes` and `quality`.
 *
 * It reads the COMMITTED snapshot, which openapi.seal.test.ts holds byte-equal to the producer at
 * PRODUCER_REF, and follows ExtractionRow.evidence_ref's $ref rather than trusting a schema's name.
 * The validator covers only the keywords that schema uses, and fails on any keyword it does not
 * know, so a schema that grows past it cannot pass by being half read.
 */
type Schema = Record<string, unknown>;
const KNOWN = new Set(["type", "required", "properties", "additionalProperties", "anyOf", "items", "minItems", "maxItems", "minimum", "maximum", "pattern", "title", "description", "$ref"]);

function violations(s: Schema, v: unknown, at: string, all: Record<string, Schema>): string[] {
  const unknown = Object.keys(s).filter((k) => !KNOWN.has(k));
  if (unknown.length) return [`${at}: unread keyword(s) ${unknown.join(",")}`];
  if (typeof s.$ref === "string") return violations(all[s.$ref.split("/").pop()!], v, at, all);
  if (Array.isArray(s.anyOf)) {
    const each = (s.anyOf as Schema[]).map((b) => violations(b, v, at, all));
    return each.some((e) => e.length === 0) ? [] : [`${at}: matches no branch (${each.flat().join("; ")})`];
  }
  const t = s.type;
  if (t === "null") return v === null ? [] : [`${at}: not null`];
  if (t === "integer" && !Number.isInteger(v)) return [`${at}: not an integer`];
  if (t === "number" && (typeof v !== "number" || !Number.isFinite(v))) return [`${at}: not a number`];
  if (t === "string" && typeof v !== "string") return [`${at}: not a string`];
  if (t === "array" && !Array.isArray(v)) return [`${at}: not an array`];
  if (t === "object" && (typeof v !== "object" || v === null || Array.isArray(v))) return [`${at}: not an object`];
  const out: string[] = [];
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) out.push(`${at}: below ${s.minimum}`);
    if (typeof s.maximum === "number" && v > s.maximum) out.push(`${at}: above ${s.maximum}`);
  }
  if (typeof v === "string" && typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) out.push(`${at}: fails pattern`);
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) out.push(`${at}: fewer than ${s.minItems}`);
    if (typeof s.maxItems === "number" && v.length > s.maxItems) out.push(`${at}: more than ${s.maxItems}`);
    if (s.items) v.forEach((x, i) => out.push(...violations(s.items as Schema, x, `${at}[${i}]`, all)));
  }
  if (t === "object") {
    const o = v as Record<string, unknown>;
    const props = (s.properties ?? {}) as Record<string, Schema>;
    for (const k of (s.required ?? []) as string[]) if (!(k in o)) out.push(`MISSING ${k}`);
    for (const k of Object.keys(o)) {
      if (k in props) out.push(...violations(props[k], o[k], k, all));
      else if (s.additionalProperties === false) out.push(`EXTRA ${k}`);
    }
  }
  return out;
}

describe("the contract leg: the published evidence_ref schema resolves this file's refs the ruled way", () => {
  const doc = JSON.parse(readFileSync(path.join(__dirname, "../api/openapi/cortex-bff.openapi.json"), "utf8"));
  const all = doc.components.schemas as Record<string, Schema>;
  const field = all.ExtractionRow?.properties as Record<string, Schema> | undefined;
  const ref = ((field?.evidence_ref?.anyOf as Schema[] | undefined) ?? []).map((b) => b.$ref).find((r): r is string => typeof r === "string");
  const schema = ref ? all[ref.split("/").pop()!] : undefined;

  it("ExtractionRow.evidence_ref resolves to a closed object schema", () => {
    expect(schema, `ExtractionRow.evidence_ref names no schema (ref=${ref}) -- the arms below would read nothing`).toBeDefined();
    expect(schema!.additionalProperties, "a schema open to extra keys admits OLD_REF's page_dims -- it seals nothing").toBe(false);
  });

  it("NEW_REF and MULTI_REF are ACCEPTED", () => {
    expect(violations(schema!, NEW_REF, "NEW_REF", all), "doc-tools' one-box wire ref").toEqual([]);
    expect(violations(schema!, MULTI_REF, "MULTI_REF", all), "doc-tools' several-box wire ref, with its note").toEqual([]);
  });

  it("OLD_REF is REJECTED by keys the contract does not have, and by nothing it is missing", () => {
    const why = violations(schema!, OLD_REF, "OLD_REF", all);
    expect(why.filter((w) => w.startsWith("EXTRA ")).sort(), "OLD_REF refused for page_dims and units").toEqual(["EXTRA page_dims", "EXTRA units"]);
    expect(why.filter((w) => w.startsWith("MISSING ")), "OLD_REF must not be refused for a missing key -- that is the pre-ruling schema").toEqual([]);
  });
});
