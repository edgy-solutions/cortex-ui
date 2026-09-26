/**
 * THE CONTRIBUTION_RANKING ENVELOPE FIELDS, READ FROM THE PRODUCER RATHER THAN BELIEVED.
 *
 * ── WHY THIS FILE EXISTS: A COMMENT WENT STALE AND NOTHING COULD SAY SO ────────────────────
 *
 * `SemanticInterpreter.tsx` carried a note, for months, saying the producer's per-archetype
 * projector tuple "names four fields which do not include" `threshold` / `threshold_defaulted`.
 * That was true when written. The producer added both fields afterwards, and A COMMENT IS CHECKED
 * BY NOTHING — so the note went on telling every reader that a quiet bound header was an upstream
 * debt, when the upstream half had already landed. Corrected 2026-09-25 against
 * `agent_fleet/presentation_agent/main.py:752`.
 *
 * Correcting the prose does not stop the same thing happening again. This does: the claim now
 * lives as an assertion against the producer's own declaration, so the next time that tuple moves,
 * a test fails instead of a comment quietly becoming false.
 *
 * ── WHAT IS DELIBERATELY *NOT* SEALED HERE ─────────────────────────────────────────────────
 *
 * ⛔ There is no assertion that the stale SENTENCE is absent from the interpreter. It would have to
 * scan for the phrase, and the corrected comment QUOTES the phrase in order to retract it — so the
 * seal would fire on the fix. Stripping comments first does not help either, because the claim only
 * ever lives in a comment. A search by name finds the prose about the name; that is a known trap in
 * this repo and this is where it bites. The live read below is the real instrument, and a phrase
 * scan beside it would be decoration that fails on the correction.
 *
 * This seal proves the two DECLARATIONS agree. Whether either side behaves correctly is the
 * contract tests' job on this side and the producer's suite on theirs.
 *
 * ── AND THE THIRD STATE ENDED, 2026-09-26 ──────────────────────────────────────────────────
 *
 * When this file was written the bound pair was DECLARED AND NEVER OBSERVED, and the last test
 * below asserted exactly that. Lane 1's capture carries both fields, so that assertion is now
 * false — and it stayed GREEN through the change, because its sweep could only see
 * `*payload*.json` while the capture arrived as a `.md`. The flipped assertion and the reason the
 * old one could not fail are both recorded at that test, not here, so a reader meets them
 * together.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LOT4_CONTRIBUTION_RANKING_PAYLOAD } from "@/lib/cardExport.fixture";

/** Both names the producer checkout goes by — see the disposition parity seal for why two. */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];
const PRESENTATION = "agent_fleet/presentation_agent/main.py";
/** The cost engine, which is what actually EMITS this archetype's envelope. */
const COST_MEASURES = "agent_fleet/cost_agent/measures.py";
const INTERPRETER = path.join(__dirname, "SemanticInterpreter.tsx");
const EXPORT_BUTTON = path.join(__dirname, "..", "AgenticCanvas", "CardExportButton.tsx");

function resolveProducer(relative: string): string[] {
  const found: string[] = [];
  for (const name of CANDIDATE_ROOTS) {
    // FOUR levels: this file sits at src/components/registry. Three lands on the repo root and
    // finds nothing, and every assertion below would then pass over an empty list.
    const file = path.join(__dirname, "../../../..", name, relative);
    if (existsSync(file)) found.push(file);
  }
  return found;
}

const FOUND = resolveProducer(PRESENTATION);
const MEASURES = resolveProducer(COST_MEASURES);

/** The tuple's second element — the card-level scalars the projector carries for this archetype. */
function declaredEnvelopeFields(src: string): string[] {
  // One occurrence in the file, verified 2026-09-25, so the match needs no disambiguation. The
  // tuple is `("rows", ( ...names... ))` and spans lines, hence the `[\s\S]`.
  const m = src.match(/"CONTRIBUTION_RANKING":\s*\(\s*"rows"\s*,\s*\(([\s\S]*?)\)\s*\)/);
  expect(m, "no _PROJECTED_ARCHETYPES entry for CONTRIBUTION_RANKING found in main.py").toBeTruthy();
  return Array.from(m![1].matchAll(/"([a-z_]+)"/g)).map((x) => x[1]);
}

describe("the CONTRIBUTION_RANKING projector tuple, as the producer declares it", () => {
  it("resolved exactly one producer checkout — or says it did not", () => {
    // NOT INSIDE A SKIP. A suite of skips reports as a pass, so "nothing disagreed" and "nothing
    // ran" would be indistinguishable in a green summary. In CI the producer is checked out beside
    // cortex-ui at a pinned sha; locally, clone it as a sibling of this repo.
    expect(
      FOUND.length,
      `no producer checkout found under any of ${CANDIDATE_ROOTS.join(", ")} — the projector ` +
        `tuple parity seal VERIFIED NOTHING.`,
    ).toBeGreaterThan(0);
  });

  it.skipIf(FOUND.length === 0)("names SEVEN fields, and the count is asserted on purpose", () => {
    const fields = declaredEnvelopeFields(readFileSync(FOUND[0], "utf8"));
    // ⛔ IT WAS SIX, AND THE EXACT COUNT IS WHY WE KNOW. This was written `toHaveLength(6)` with
    // the note "if the producer adds a seventh field, this goes red and someone re-reads it". On
    // 2026-09-26 it went red: the producer added `method` in `546e6bee` (2026-09-24, "every cost
    // ranking states its own method, and the projector carries it"). A `>=` bound would have let
    // that through silently — the same drift that put a stale count in a comment for months.
    //
    // SEVEN, still not "at least seven", for the same reason.
    expect(fields).toHaveLength(7);
    expect(fields).toEqual([
      "value_label",
      "value_unit",
      "scope_label",
      "verdict",
      "threshold",
      "threshold_defaulted",
      "method",
    ]);
  });

  it.skipIf(MEASURES.length === 0 || FOUND.length === 0)(
    "⛔ the method block is declared AND emitted upstream — and the 2026-09-26 capture carries none",
    () => {
      // THE ORDER SAID "render the `method` block from the real wire". This is the measurement of
      // what that clause has to work with, and it is not the simple absence the fixture header
      // first recorded.
      //
      //   DECLARED   the projector's tuple names `method` (asserted above), since 2026-09-24
      //   EMITTED    `cost_supplier_concentration` builds one — formula, five named inputs, a
      //              float bound and `bound_defaulted` — for THIS verb, not some sibling
      //   ABSENT     Lane 1's 2026-09-26 capture has no `method` key anywhere
      //
      // Both halves of the upstream contract are in place and the payload still arrived without
      // one, so the difference is a VINTAGE — an engine or projector image older than 546e6bee —
      // and NOT a missing feature. ⚠ It cannot be resolved from the capture: those bytes carry no
      // producer sha, no `fleet_sha` and no `code_hash`, which is asserted in
      // `cardExport.fixture.test.ts`. Whoever re-fires this census should capture the fleet sha
      // beside it, or the next absence reads exactly like this one.
      const fields = declaredEnvelopeFields(readFileSync(FOUND[0], "utf8"));
      expect(fields).toContain("method");

      const measures = readFileSync(MEASURES[0], "utf8");
      // The verb, then its method block — scoped to the function body so a sibling measure's
      // block cannot stand in for this one. A name search that found `_method(` anywhere in a
      // 1000-line module would prove nothing about supplier concentration.
      const start = measures.indexOf("def cost_supplier_concentration(");
      expect(start, "the verb this capture answered is not in the cost engine").toBeGreaterThan(-1);
      const body = measures.slice(start, measures.indexOf("\ndef ", start + 1));
      expect(body).toContain('"method": _method(');
      expect(body).toContain("bound_defaulted=defaulted");

      // And the capture, read off disk rather than believed.
      const captureText = readFileSync(
        path.join(__dirname, "../../../sessions/2026-09-26-payload-lot4-contribution-ranking.json"),
        "utf8",
      );
      expect(captureText).toContain('"threshold_defaulted"'); // the control: this IS the capture
      expect(captureText).not.toContain('"method"');
    },
  );

  it.skipIf(FOUND.length === 0)("carries the bound pair — the correction, as an assertion", () => {
    const fields = declaredEnvelopeFields(readFileSync(FOUND[0], "utf8"));
    // The two fields the stale comment said were absent. THIS is the line that would have caught it.
    expect(fields).toContain("threshold");
    expect(fields).toContain("threshold_defaulted");
  });

  it("this side passes both props, so the wire is sufficient end to end", () => {
    // The near half of the join. A projector that carries a field into a card that never reads it
    // is the advertised-unconsumed shape, and it looks identical to a missing field from the UI.
    const src = readFileSync(INTERPRETER, "utf8");
    expect(src).toContain("threshold={comp.threshold}");
    expect(src).toContain("threshold_defaulted={comp.threshold_defaulted}");

    // ⚠ `method` IS CONSUMED ON A DIFFERENT SURFACE, and saying so is the point. It is NOT a card
    // prop — `ContributionRanking` takes none — it is read by the export, component-level first
    // and envelope-level second. So "does this side read the seventh declared field" is answered
    // yes, by the export, and a future reader looking for it among the card's props would
    // correctly conclude the card ignores it.
    const exportButton = readFileSync(EXPORT_BUTTON, "utf8");
    expect(exportButton).toContain("readMethod(componentLevel?.method)");
    expect(exportButton).toContain("readMethod(envelopeLevel?.method)");
    expect(src).not.toContain("method={comp.method}");
  });

  it("the bound pair IS observed now — and the filter that said otherwise could not have seen it", () => {
    // ⛔ THIS SEAL USED TO ASSERT THE OPPOSITE, AND IT WAS GREEN ON THE DAY IT BECAME FALSE.
    //
    // Until 2026-09-26 this test read: "neither field has EVER been observed on the wire". Lane 1
    // placed a real CONTRIBUTION_RANKING capture carrying `threshold: "0.25"` and
    // `threshold_defaulted: true`, and this test DID NOT GO RED — because its sweep filtered to
    // `*payload*.json` and the capture arrived as a `.md` session file. The zero it reported was a
    // claim about the filter, not about the repo.
    //
    // That is the failure worth keeping the memory of: not a wrong assertion, an assertion nothing
    // in the incoming data could reach. So the sweep is widened here, and what it measures is
    // asserted in both arms — including the arm that is still zero.
    const dir = path.join(__dirname, "../../../sessions");
    const all = readdirSync(dir);
    const read = (n: string) => readFileSync(path.join(dir, n), "utf8");

    // A JSON-SHAPED MATCH, NOT A NAME. Prose about a field name and a captured value of that field
    // are not the same evidence, and in this repo the prose is the more common of the two.
    const jsonShaped = (key: string) => new RegExp(`"${key}"\\s*:`);

    // ── ARM 1: the glob the OLD seal used. It finds the pair now — because the capture was
    //    extracted INTO that glob's reach, which is the other half of the fix. ───────────────
    const jsonFixtures = all.filter((n) => n.includes("payload") && n.endsWith(".json"));
    expect(jsonFixtures.length, "no payload captures found — arm 1 would be vacuous").toBeGreaterThan(0);
    const jsonThreshold = jsonFixtures.filter((n) => read(n).includes("threshold"));
    const jsonVerdict = jsonFixtures.filter((n) => read(n).includes("verdict"));
    // EXACTLY ONE, BY NAME. The nine 2026-09-19 producer captures still carry nothing, so this is
    // not "the glob was always fine" — it is "the capture is now where the glob can see it".
    expect(jsonThreshold).toEqual(["2026-09-26-payload-lot4-contribution-ranking.json"]);
    // THE CONTROL, unchanged in purpose: a count of one is evidence only if the same instrument
    // finds something that IS in the other nine.
    expect(jsonVerdict.length, "the control found no verdict either, so arm 1 proves nothing")
      .toBeGreaterThan(1);

    // ── ARM 2: the whole ledger, which is where the capture actually landed. ─────────────────
    const ledger = all.filter((n) => n.endsWith(".md") || n.endsWith(".json"));
    expect(ledger.length, "the widened sweep enumerated almost nothing — the directory is wrong")
      .toBeGreaterThan(10);

    const observed = ledger.filter((n) => jsonShaped("threshold_defaulted").test(read(n)));
    expect(observed.sort()).toEqual([
      "2026-09-26-capture-from-lane-1-the-lot-4-contribution-ranking-card-real-and-post-projector.md",
      "2026-09-26-payload-lot4-contribution-ranking.json",
    ]);
    // TWO FILES, ONE OBSERVATION. The .json is the report's own fenced block, extracted so the
    // corpus instruments can reach it, and cardExport.fixture.test.ts asserts the two agree — so
    // counting files here would overstate the evidence. There is still exactly ONE capture, and
    // one capture cannot tell an engine default from a caller-supplied bound: `threshold_defaulted: true`
    // is this engine's default, and nothing here says a caller-chosen bound would arrive at all.
    expect(observed).toHaveLength(2);

    // The same matcher, on a field known to be in that capture — so an over-strict regex cannot
    // masquerade as "found exactly one".
    expect(jsonShaped("scope_label").test(read(observed[0]))).toBe(true);

    // ── AND THE INSTRUMENT THAT CANNOT TELL THE DIFFERENCE, MEASURED SIDE BY SIDE. ───────────
    // A loose name sweep over the same files hits SIX, of which FOUR are this lane's own reports
    // discussing the field's ABSENCE — dated 2026-09-19, -09-19, -09-24 and -09-25, every one of them
    // before any capture carried the field. Asserted, rather than described, because the tempting fix to
    // arm 1 was "widen the filter and keep using `includes`" — which would have reported the
    // field observed on 2026-09-19, a week before any capture carried it.
    const looseName = ledger.filter((n) => read(n).includes("threshold_defaulted"));
    expect(looseName.length).toBeGreaterThan(observed.length);
    expect(looseName).toContain(observed[0]);

    // ── THE JOIN CLOSES: declared upstream, on the wire, and transcribed into the fixture. ───
    // Without this, "observed" lives in a session file that no code reads.
    expect(LOT4_CONTRIBUTION_RANKING_PAYLOAD.threshold).toBe("0.25");
    expect(LOT4_CONTRIBUTION_RANKING_PAYLOAD.threshold_defaulted).toBe(true);
  });
});
