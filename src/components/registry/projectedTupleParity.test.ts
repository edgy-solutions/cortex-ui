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
import { readMethod } from "@/lib/cardExport";
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

/** This repo's own ledger: four levels up from src/components/registry is the repo root. */
const SESSIONS = path.join(__dirname, "../../../sessions");

/** The tuple's second element — the card-level scalars the projector carries for this archetype. */
function declaredFieldsFor(src: string, archetype: string): string[] {
  // One occurrence per archetype in the file, verified 2026-09-25, so the match needs no
  // disambiguation. The tuple is (`"rows"`, ( ...names... )) and spans lines,
  // hence the character-class pair that also matches newlines.
  const re = new RegExp(
    '"' + archetype + '":\\s*\\(\\s*"rows"\\s*,\\s*\\(([\\s\\S]*?)\\)\\s*\\)',
  );
  const m = src.match(re);
  expect(m, `no _PROJECTED_ARCHETYPES entry for ${archetype} found in main.py`).toBeTruthy();
  return Array.from(m![1].matchAll(/"([a-z_]+)"/g)).map((x) => x[1]);
}

/**
 * The archetype this file is named for. Kept as its own function because most seals below are
 * about it, and because every existing call site reads better without a repeated string literal.
 */
function declaredEnvelopeFields(src: string): string[] {
  return declaredFieldsFor(src, "CONTRIBUTION_RANKING");
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

  /**
   * ⛔ THE OMISSION'S JUSTIFICATION IS NOW HALF-FALSE — and it is the added field that broke it.
   *
   * Raised by the invincible-agent lane on 2026-09-26 and VERIFIED HERE against both producer
   * files rather than taken on report, because a claim about the producer arriving by message is
   * exactly the kind this file exists to check.
   *
   * The projector carries the payload key plus the declared envelope fields and nothing else, so
   * every envelope field needs an entry. One is deliberately withheld, and the comment gives a
   * reason: `suppliers_above_threshold` "is a count the card derives from the rows it already has,
   * and adding it would put two sources of the same fact on the wire — the kind of pair that goes
   * out of agreement silently. The bound is a DECLARATION the card cannot reconstruct; the count
   * is not."
   *
   * That is a good rule, and `method` — added later, to fix an unrelated drop — walks straight
   * through it. Its `inputs` carry VALUES, and two of the five are facts the card derives from the
   * rows it already has:
   *
   *   `suppliers`               `len(rows)`
   *   `total purchased value`   the sum of the rows' `amount` strings
   *
   * ⚠ AND THE SHARPENING THAT CAME WITH THE REPORT IS OFF BY ONE FIELD, which matters because the
   * two readings call for different fixes. It is NOT `suppliers_above_threshold` that arrived by
   * the back door — that count is in neither the tuple nor the method block, and this seal asserts
   * both. What arrived is two OTHER derivable facts, so the rule was breached in principle while
   * the field it was written about stayed off the wire. Widening the allowlist would not fix this;
   * deciding what a method block's inputs may restate would.
   *
   * WHERE THE DRIFT ACTUALLY LIVES, since "two sources" is a hazard and not yet a defect: inside
   * one payload they cannot disagree — the block is built from the same locals as the rows, in the
   * same call, which the producer's own comment says of the bound. The exposure is downstream, in
   * any consumer that FILTERS or drops rows: `suppliers: "4"` and a total over four amounts keep
   * describing a set the reader is no longer being shown. ⚠ This side already carries the
   * contradicting check — `cardExport.fixture.test.ts` recomputes both from the capture's own rows
   * rather than trusting the fixture — which is the cheap guard the producer's reasoning implies
   * and neither side had written down.
   *
   * ⛔ THE READER HALF IS NOW DONE; THE PRODUCER HALF IS NOT. This paragraph used to say "no order
   * covers either", and half of that went stale on 2026-09-27: an order did arrive for the reader,
   * and `MethodBlock` now carries `unit`, `bound`, `bound_defaulted` and `producer_sha` with their
   * JSON types, sealed against the producer's own executed `model_dump` in
   * `src/lib/methodBlockPacketCapture.json`. So "a wider producer with no reader" is no longer the
   * standing state — this is a wider producer WITH a reader, and the asymmetry has moved.
   *
   * What is still open is the other half, and it is the one that needs a ruling rather than a
   * reader: whether a method block's `inputs` may restate a fact the rows already carry, and hence
   * whether the projector's allowlist should widen. Rulings originate in invincible-agent, so this
   * side records the question and does not number an answer. The seal below is unchanged either
   * way — it asserts what is on the wire, not what ought to be.
   */
  it.skipIf(MEASURES.length === 0 || FOUND.length === 0)(
    "⛔ the withheld count is still withheld — but the method block restates two facts the rows carry",
    () => {
      const projector = readFileSync(FOUND[0], "utf8");
      const measures = readFileSync(MEASURES[0], "utf8");

      // 1. The justification is really there, in those words. If someone rewrites or deletes it,
      //    this goes red and the finding below loses its subject — which is the right outcome:
      //    a note about a contradiction outliving the claim it contradicts is how this file's
      //    own stale comment happened.
      expect(projector).toContain("`suppliers_above_threshold` is DELIBERATELY NOT HERE");
      expect(projector).toContain("two sources of the same fact on the wire");

      // 2. And the withholding HELD. Asserted against the tuple, not against the comment.
      const fields = declaredEnvelopeFields(projector);
      expect(fields).not.toContain("suppliers_above_threshold");

      // 3. The count is not in the method block either, so the report's version of this finding
      //    is corrected rather than repeated.
      const start = measures.indexOf("def cost_supplier_concentration(");
      expect(start).toBeGreaterThan(-1);
      const body = measures.slice(start, measures.indexOf("\ndef ", start + 1));
      expect(body).not.toContain('_inp("suppliers_above_threshold"');

      // 4. What IS in it: two inputs whose values the rows already carry. Read off the producer's
      //    own call site, so this cannot drift into a claim about a block we composed.
      expect(body).toContain('_inp("suppliers", len(rows))');
      expect(body).toContain('_inp("total purchased value", purchased, VALUE_UNIT)');
      // The control on that pair — the same instrument on an input that is NOT derivable from the
      // rows. A bound is a declaration; if this matcher found nothing at all, points 4 and 5
      // would both be vacuous.
      expect(body).toContain('_inp("threshold", bound)');

      // 5. And the same two facts are derivable from the capture's rows, measured on the bytes.
      //    This is the half that makes it a restatement rather than new information.
      const capture = JSON.parse(
        readFileSync(
          path.join(__dirname, "../../../sessions/2026-09-26-payload-lot4-contribution-ranking.json"),
          "utf8",
        ),
      ) as { final?: { components?: { rows?: { amount: string }[] }[] } };
      const rows = capture.final?.components?.[0]?.rows ?? [];
      expect(rows).toHaveLength(4);
      expect(String(rows.length)).toBe("4");
      const cents = rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);
      expect((cents / 100).toFixed(2)).toBe("1475520.00");
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
    // JSON-SHAPED HERE TOO, AND FOR BOTH. Arm 1 matched the bare word until 2026-09-30, when a
    // docs capture arrived whose 77k runbook body says "threshold" in prose and the arm counted it
    // as a second capture of the field. The control uses the same instrument as the arm it controls.
    const jsonThreshold = jsonFixtures.filter((n) => jsonShaped("threshold").test(read(n)));
    const jsonVerdict = jsonFixtures.filter((n) => jsonShaped("verdict").test(read(n)));
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

/**
 * THE WITHHELD-COUNT RULE AND THE ALLOWLISTED COUNTS ARE BOTH RIGHT — the discriminator is
 * TRUNCATION DETECTABILITY, and until 2026-09-26 it lived in two comments and no seal.
 *
 * ⚠ THIS BLOCK REPLACES A WRONG ONE, and the way it was wrong is the reason it is sealed now.
 * Its first version read the COMPETING_MEASURES entry as a CONTRADICTION of the rule at
 * `main.py:748` — three counts the card can derive, carried by name, ~70 lines from the comment
 * forbidding exactly that, and observed on a real wire a week before the `method` block existed.
 * Every one of those facts is true and the conclusion did not follow. `main.py:658-664`, dated
 * 2026-09-11, states the exception and its reason twenty lines ABOVE the entry:
 *
 *   "an undefined method KEEPS ITS ROW, and without these the card cannot say that three rows are
 *   not three answers. Dropping a row would turn a comparison of three into a comparison of two
 *   without appearing to."
 *
 * So the rule is not "a count derivable from the rows must not travel". It is "a count derivable
 * from rows THAT COULD HAVE BEEN TRUNCATED WITHOUT TRACE must travel, and every other derivable
 * count must not":
 *
 *   `suppliers_above_threshold`  a property of the rows PRESENT. If rows go missing both copies
 *                               are wrong the same way, so the second copy buys only disagreement
 *                               risk. Withholding is right.
 *   `methods_compared`          a claim about the COMPLETENESS of the row set. A card counting its
 *                               own rows to learn how many methods were compared cannot ever
 *                               detect a dropped one — the total and the parts come from the same
 *                               parse, so they agree by construction. Carrying it is right.
 *
 * ⚠ AND MY OWN SEAL BELOW IS THE DEMONSTRATION, which is why it is kept rather than deleted: the
 * second test asserts `methods_compared === rows.length` on a real capture, measured, green. That
 * equality is exactly what a derivation cannot distinguish from truncation. An assertion that the
 * two agree on unfiltered data is the coincidence-defect shape and not evidence of redundancy.
 *
 * THREE SESSIONS ARGUED THIS FROM SOURCE because the discriminator was prose on both sides and an
 * assertion on neither. It is stated in this repo too — `CompetingMeasures.contract.ts` and that
 * card's test header carry nearly the producer's sentence. So it is sealed in both places now:
 * here, that the producer's two rules coexist and say why; and in
 * `CompetingMeasures.test.tsx`, ⛔ that this side does NOT use the pair as the detector it is —
 * `required: false`, a silent `?? rows.length` fallback, and no reconciliation when the two
 * disagree. The consumer half of the ruling is there, not here.
 *
 * WHAT DOES STILL WANT A RULING, found by the engine lane once its own census was rerun
 * unfiltered: `planning_agent/measures.py:1099` puts `change_count = len(entries)` INSIDE the
 * payload key, and `tests/planning/test_engine_p_routes.py:189` reads it at
 * `changes["rows"]["change_count"]`. A row-level field needs no allowlist entry, so `:748` cannot
 * reach it at all. Whatever the ruling says about envelope declarations governs the smaller
 * surface. RECORDED, NOT PATCHED; rulings originate in invincible-agent.
 */
describe("the withheld-count rule and the counts the allowlist carries anyway", () => {
  it.skipIf(FOUND.length === 0)(
    "the two rules coexist — and the file states the truncation discriminator, twenty lines up",
    () => {
      const projector = readFileSync(FOUND[0], "utf8");
      // The rule, in its own words, so this seal loses its subject if someone retracts it.
      expect(projector).toContain("two sources of the same fact on the wire");

      // THE DISCRIMINATOR ITSELF, which is the assertion that did not exist before today. If
      // someone deletes or rewords this, the exception below stops being explained and the
      // argument that took three sessions is available to be had a fourth time.
      expect(projector).toContain("an undefined method KEEPS ITS ROW");
      // Two fragments, because the sentence wraps across a comment line in the producer and the
      // contiguous form is not in the file — the first attempt at this assertion spanned the break
      // and went red for a reason that had nothing to do with the claim.
      expect(projector).toContain("Dropping a row would turn a comparison of three into a");
      expect(projector).toContain("comparison of two without appearing to");

      const competing = declaredFieldsFor(projector, "COMPETING_MEASURES");
      // The control first: the extractor must have found a real tuple. An empty list would make
      // every assertion below vacuous, and this is the exact failure this file was written after.
      expect(competing.length).toBeGreaterThan(5);
      expect(competing).toContain("verdict"); // a field nobody disputes, read by the same regex

      // The three completeness-bearing counts travel, BY NAME.
      expect(competing).toContain("methods_compared");
      expect(competing).toContain("methods_answered");
      expect(competing).toContain("all_methods_answered");

      // And the count that is a property of the rows present does NOT — the same file, the other
      // side of the discriminator. Asserted against the tuple, never against the comment.
      expect(declaredEnvelopeFields(projector)).not.toContain("suppliers_above_threshold");
    },
  );
  it("on a real wire the count EQUALS the row count — which is what a derivation cannot tell from a drop", () => {
    // Source says the projector carries it; this says the card got it, on the 2026-09-19 capture,
    // nine days older than the lot 4 one and seven older than 546e6bee.
    const capture = JSON.parse(
      readFileSync(path.join(SESSIONS, "2026-09-19-payload-finance-eac-comparison.json"), "utf8"),
    ) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const comp = capture.projected?.find((p) => p.archetype === "COMPETING_MEASURES")?.payload;
    expect(comp, "the EAC capture no longer projects a COMPETING_MEASURES component").toBeTruthy();

    const rows = comp!.rows as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    // ⚠ THE POINT OF THIS TEST IS THAT IT PASSES, AND THAT PASSING PROVES NOTHING ABOUT
    // REDUNDANCY. The producer's count equals the rows beside it on an intact payload — it must,
    // or the producer is broken. A consumer that derives the count instead reproduces this same
    // equality on a TRUNCATED payload too, agreeing with whatever survived. The two states are
    // indistinguishable from the rows alone, which is why the field travels.
    expect(comp!.methods_compared).toBe(rows.length);
    expect(comp!.methods_answered).toBe(rows.filter((r) => r.eac_exact !== null).length);

    // No method block anywhere near this: the field is absent from the component, and the `method`
    // that IS here is a row-level string naming the EAC method.
    expect("method" in comp!).toBe(false);
    expect(typeof rows[0].method).toBe("string");
  });

  it("a finance ROW is REFUSED by the reader — the call site is no longer the only guard", () => {
    // WHY THIS IS SEALED, and it is not what I first assumed. Two engines now use the key `method`
    // for different things: cost sends an envelope-level BLOCK, finance a row-level STRING naming
    // the EAC method, beside a row-level `formula`. A reader chasing "why is method not rendering"
    // could reasonably point `readMethod` at the rows.
    //
    // ⚠ WHAT THIS MEASURED, AND IT IS NOW FIXED. The bare string was dropped, as a non-record must
    // be — but a finance ROW PASSED, because it has a `formula` and a non-empty `formula` was the
    // only thing `readMethod` required. What came back was a plausible block carrying the row's
    // formula with no inputs and no bound, rendered under a heading that tells the reader the
    // PRODUCER accounted for its own arithmetic. Fabricated provenance, not a blank.
    //
    // Ruled 2026-09-26 (arch): a row must never yield a block, decoupled from the `method_label`
    // rename that waits on the producer. So the reader is hardened and this seal now asserts the
    // refusal. What changed my mind about the fix I declined below is the KEY it turns on — see
    // `readMethod`: requiring the inputs a formula was computed from is a positive property of a
    // method block, not a guess about a row, so a row that grows a block's field still fails it.
    expect(readMethod("CPI")).toBeNull();

    expect(
      readMethod({
        method: "CPI",
        formula: "EAC = BAC / CPI",
        eac: 4200000,
      }),
    ).toBeNull();
    // Verbatim from `sessions/2026-09-19-payload-finance-eac-comparison.json`, not a shape I
    // composed to fail: the row this hazard was found on, with the keys it really ships.
    expect(
      readMethod({
        acwp: 7430000.0,
        bac: 12000000,
        cpi: 0.847913862718708,
        eac: 14152380.95,
        eac_exact: "14152380.95",
        formula: "EAC = BAC / CPI",
        method: "CPI",
        unavailable_reason: null,
        value: 14152380.95,
        value_unit: "USD",
      }),
    ).toBeNull();
    // THE CONTROL, in the same breath: a real block still reads, so the hardening is a
    // discrimination and not a mute. This one differs from the row in exactly the thing the
    // reader decides on — it names what went in.
    expect(
      readMethod({
        formula: "EAC = BAC / CPI",
        inputs: [{ name: "BAC", value: 12000000 }],
      }),
    ).not.toBeNull();

    // AND THE CALL SITE IS STILL ASSERTED, because two guards for one hazard is the point: the
    // export reads `method` off the component and off the envelope, never off a row. The reader's
    // refusal makes a mistake here a blank instead of a fabrication; it does not make it correct.
    const exportButton = readFileSync(EXPORT_BUTTON, "utf8");
    expect(exportButton).toContain("readMethod(componentLevel?.method)");
    expect(exportButton).toContain("readMethod(envelopeLevel?.method)");
    expect(exportButton).not.toMatch(/readMethod\([^)]*row/);
  });
});
