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
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Both names the producer checkout goes by — see the disposition parity seal for why two. */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];
const PRESENTATION = "agent_fleet/presentation_agent/main.py";
const INTERPRETER = path.join(__dirname, "SemanticInterpreter.tsx");

function resolvePresentation(): string[] {
  const found: string[] = [];
  for (const name of CANDIDATE_ROOTS) {
    // FOUR levels: this file sits at src/components/registry. Three lands on the repo root and
    // finds nothing, and every assertion below would then pass over an empty list.
    const file = path.join(__dirname, "../../../..", name, PRESENTATION);
    if (existsSync(file)) found.push(file);
  }
  return found;
}

const FOUND = resolvePresentation();

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

  it.skipIf(FOUND.length === 0)("names SIX fields, and the count is asserted on purpose", () => {
    const fields = declaredEnvelopeFields(readFileSync(FOUND[0], "utf8"));
    // SIX, NOT "AT LEAST SIX". The staleness this file exists to prevent was a wrong COUNT in a
    // comment, so if the producer adds a seventh field, this goes red and someone re-reads the
    // note that says six. A `>=` bound would let exactly that drift through again.
    expect(fields).toHaveLength(6);
    expect(fields).toEqual([
      "value_label",
      "value_unit",
      "scope_label",
      "verdict",
      "threshold",
      "threshold_defaulted",
    ]);
  });

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
  });

  it("neither field has EVER been observed on the wire — declared is not arriving", () => {
    // ⛔ THE THIRD STATE, and the reason the corrected comment does not simply say "it works now":
    // the projector declares these, and no capture has ever carried one. Declared-and-never-seen is
    // distinct from both "not wired" and "arriving", and only the last of the three means a bound
    // will draw. Measured across every capture in the repo, with a control below.
    const dir = path.join(__dirname, "../../../sessions");
    const files = readdirSync(dir)
      .filter((n) => n.includes("payload") && n.endsWith(".json"))
      .map((n) => path.join(dir, n));
    expect(
      files.length,
      "no payload captures found — this assertion would be vacuous",
    ).toBeGreaterThan(0);

    let thresholdHits = 0;
    let verdictHits = 0;
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (text.includes("threshold")) thresholdHits++;
      if (text.includes("verdict")) verdictHits++;
    }
    expect(thresholdHits).toBe(0);
    // THE CONTROL. Zero hits is only evidence if the same instrument finds something that IS
    // there — otherwise a broken read and an honest absence are the same number.
    expect(verdictHits, "the control found no `verdict` either, so the zero above proves nothing")
      .toBeGreaterThan(0);
  });
});
