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

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContributionRanking } from "@/components/planning/ContributionRanking";
import {
  ABSENT_MARK,
  METHOD_ABSENT_SENTENCE,
  buildCardExportHtml,
  exportFileName,
  flattenPayload,
  readExportProvenance,
  readMethod,
  stripExecutable,
  type CardExportInput,
  type PayloadCell,
} from "./cardExport";
import {
  LOT4_CONTRIBUTION_RANKING_PAYLOAD,
  LOT4_CONTRIBUTION_ROWS,
  LOT4_EXPORT_PROVENANCE,
  LOT4_METHOD_PRESENT,
} from "./cardExport.fixture";

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
    rows={LOT4_CONTRIBUTION_ROWS}
    value_label={LOT4_CONTRIBUTION_RANKING_PAYLOAD.value_label}
    value_unit={LOT4_CONTRIBUTION_RANKING_PAYLOAD.value_unit}
    scope_label={LOT4_CONTRIBUTION_RANKING_PAYLOAD.scope_label}
  />,
);

function input(over: Partial<CardExportInput> = {}): CardExportInput {
  return {
    title: "Lot 4 · cost variance contribution",
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
    // So the walker needs an oracle it did not compute. This list is written by hand from the
    // fixture, and it is the only assertion here that can indict `flattenPayload` itself.
    expect(flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD)).toEqual([
      { path: "archetype", value: "CONTRIBUTION_RANKING" },
      { path: "rows[0].entity_id", value: "CA1" },
      { path: "rows[0].entity_name", value: "Control Account 3.1" },
      { path: "rows[0].contribution", value: "-800000" },
      { path: "rows[0].share_of_total", value: "0.62" },
      { path: "rows[0].favourable", value: "false" },
      { path: "rows[0].bcws", value: "3000000" },
      { path: "rows[0].bcwp", value: "2200000" },
      { path: "rows[0].acwp", value: "3000000" },
      { path: "rows[1].entity_id", value: "CA2" },
      { path: "rows[1].entity_name", value: "Control Account 4.2" },
      { path: "rows[1].contribution", value: "-300000" },
      { path: "rows[1].share_of_total", value: "0.23" },
      { path: "rows[1].favourable", value: "false" },
      { path: "rows[2].entity_id", value: "CA3" },
      { path: "rows[2].entity_name", value: "Control Account 2.7" },
      { path: "rows[2].contribution", value: "120000" },
      { path: "rows[2].share_of_total", value: "0.09" },
      { path: "rows[2].favourable", value: "true" },
      { path: "source_persona", value: "PROGRAM_FINANCE_ANALYST" },
      { path: "subject_concept", value: "NP-MERIDIAN" },
      { path: "value_label", value: "cost variance" },
      { path: "value_unit", value: "USD" },
      { path: "scope_label", value: "Lot 4" },
      { path: "verdict", value: "Integration and Test accounts for 97% of the variance" },
    ]);
    // The projector declares `threshold`/`threshold_defaulted` for this archetype and no capture
    // has ever carried them. Asserted as absent so that the day one arrives, this list is the
    // thing that says so rather than quietly widening.
    expect(
      flattenPayload(LOT4_CONTRIBUTION_RANKING_PAYLOAD).map((c) => c.path),
    ).not.toContain("threshold");
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
    const altered = html.replace(">-300000<", ">-300001<");
    expect(altered).not.toBe(html);
    const alteredCells = readPayloadTable(altered);
    expect(alteredCells).toHaveLength(expected.length);
    expect(alteredCells).not.toEqual(expected);
  });

  it("values pass through no formatter — the signed integer and the raw ratio survive", () => {
    const html = buildCardExportHtml(input());
    const byPath = new Map(readPayloadTable(html).map((c) => [c.path, c.value]));
    expect(byPath.get("rows[0].contribution")).toBe("-800000");
    expect(byPath.get("rows[0].share_of_total")).toBe("0.62");
    expect(byPath.get("rows[2].share_of_total")).toBe("0.09");
    expect(byPath.get("rows[0].favourable")).toBe("false");
    expect(byPath.get("rows[2].favourable")).toBe("true");
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

  it("present method renders formula, inputs and bound", () => {
    const html = buildCardExportHtml(input({ method: LOT4_METHOD_PRESENT }));
    const body = sectionText(html, "How the producer computed this");
    expect(body).toContain(LOT4_METHOD_PRESENT.formula);
    for (const i of LOT4_METHOD_PRESENT.inputs) {
      expect(body).toContain(i.name);
      expect(body).toContain(i.value);
    }
    expect(body).toContain(LOT4_METHOD_PRESENT.bound as string);
    expect(body).not.toContain(METHOD_ABSENT_SENTENCE);
    expect(parse(html).querySelector('[data-cx-method="present"]')).not.toBeNull();
  });

  it("a method with a formula but no inputs or bound says absent for those, not nothing", () => {
    const m = readMethod({ formula: "EAC = AC + (BAC - EV)" });
    expect(m).toEqual({ formula: "EAC = AC + (BAC - EV)", inputs: [], bound: null });
    const body = sectionText(
      buildCardExportHtml(input({ method: m })),
      "How the producer computed this",
    );
    expect(body).toContain("EAC = AC + (BAC - EV)");
    expect(body).toContain(`inputs: ${ABSENT_MARK}`);
    expect(body).toContain(`bound: ${ABSENT_MARK}`);
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
    expect(m?.inputs).toEqual([
      { name: "sv", value: "0" },
      { name: "loe", value: "false" },
      { name: "note", value: "" },
    ]);
  });

  it("reads inputs given as an object as well as an array", () => {
    const m = readMethod({ formula: "f", inputs: { BCWP: 2200000, ACWP: 3000000 } });
    expect(m?.inputs).toEqual([
      { name: "BCWP", value: "2200000" },
      { name: "ACWP", value: "3000000" },
    ]);
  });
});

describe("provenance", () => {
  it("renders all six lines, captured values verbatim", () => {
    const doc = parse(buildCardExportHtml(input()));
    const get = (k: string) =>
      doc.querySelector(`[data-cx-prov="${k}"]`)?.textContent?.trim() ?? null;
    expect(get("persona")).toBe("PROGRAM_FINANCE_ANALYST");
    expect(get("verb")).toBe("fin Variance Analysis");
    expect(get("engine")).toBe("iagent-engine-fin");
    expect(get("roll sha")).toBe("c0005142");
    expect(get("timestamp")).toBe("2026-09-19T00:00:00.000Z");
    expect(get("question asked")).toBe("which account is driving the overrun on NP-MERIDIAN");
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
    const unjudged = LOT4_CONTRIBUTION_ROWS.map(({ favourable: _drop, ...rest }) => rest);
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
    expect(parse(html).title).toBe("Lot 4 · cost variance contribution");
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
