/**
 * R-073's RETIREMENT MECHANISM — the join between two enforcements of one vocabulary.
 *
 * `unsummarised` is TEMPORARY BY CONSTRUCTION. Its repair lives on the producer: once the verbs
 * emit a verdict line, nothing can produce it. R-073's load-bearing half is that the term must
 * retire by TEST rather than by somebody remembering it was meant to be temporary — *a
 * vocabulary term with no expiry mechanism is permanent whatever its docstring says.*
 *
 * ── WHY THE JOIN IS THE MECHANISM ─────────────────────────────────────────────────────────
 *
 * The vocabulary is enforced TWICE: here, and in the presentation producer, which cites this
 * repo's contract by path and says "not invented here". Two enforcements of one fact, each
 * satisfiable alone — which is the drift shape found three times in this codebase in a week,
 * once in its own type system.
 *
 * So this asserts they AGREE. And that makes it the expiry: when 91's verbs emit verdicts and
 * the producer drops the term, this goes RED and forces cortex to drop it too. The term cannot
 * outlive its need without something failing.
 *
 * ⛔ IT DID NOT LAND WITH THE CONTRACT, DELIBERATELY. When `unsummarised` was added here the
 * producer pinned in CI PREDATED R-073, so this would have been red over a known half-landed
 * state, for a reason nobody could act on until the pin moved. A guard that fails on its own
 * missing input is removed within the hour, and then the rule has neither arm instead of one.
 * It lands now because the pinned producer carries the term — measured, not assumed.
 *
 * ── WHAT THIS CANNOT SEE ──────────────────────────────────────────────────────────────────
 *
 * It reads the producer's SOURCE at the pinned sha, not the running service. A producer that
 * declares the term and fails to apply it passes here. And it asserts the term's PRESENCE in
 * both places, never that either side's behaviour is correct — the contract tests do that on
 * this side and the producer's own suite on theirs.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DISPOSITIONS } from "./NamedHole.contract";

/** Both names the producer checkout goes by — see the parity seal for why two. */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];
/** Where the producer enforces the same vocabulary. */
const PRESENTATION = "agent_fleet/presentation_agent/main.py";

function resolvePresentation(): string[] {
  const found: string[] = [];
  for (const name of CANDIDATE_ROOTS) {
    // FOUR levels: this file sits at src/components/registry, one deeper than the parity seal
    // at src/lib. Copying its "../../.." landed on the repo root and found nothing — and the
    // two assertions below then passed VACUOUSLY over an empty list, which the assert-ran guard
    // is what caught. R-041's vacuum, in the controls of the test written to close a join.
    const file = path.join(__dirname, "../../../..", name, PRESENTATION);
    if (existsSync(file)) found.push(file);
  }
  return found;
}

const FOUND = resolvePresentation();

describe("the disposition vocabulary agrees across both repos", () => {
  it("resolved exactly one producer checkout — or says it did not", () => {
    // NOT INSIDE A SKIP. A suite of skips reports as a pass, so "the check found nothing wrong"
    // and "the check never ran" would be indistinguishable in a green summary — the hollow
    // green this repo spent a night on. In CI the producer is checked out beside cortex-ui at a
    // pinned sha; locally, clone it as a sibling of this repo.
    expect(
      FOUND.length,
      `no producer checkout found under any of ${CANDIDATE_ROOTS.join(", ")} — the disposition ` +
        `join SKIPPED ENTIRELY and verified nothing.`,
    ).toBeGreaterThan(0);
  });

  it("the producer accepts `unsummarised` — R-073's other half", () => {
    // If this fails, the two halves have come apart: either cortex declares a term the producer
    // will reject, or the producer dropped it. R-073 refuses both — "each half is refused by the
    // others if it lands alone."
    expect(FOUND.length, "nothing to read — see the assertion above").toBeGreaterThan(0);
    for (const file of FOUND) {
      const src = readFileSync(file, "utf8");
      expect(
        src.includes(DISPOSITIONS.UNSUMMARISED),
        `${file} does not mention \`${DISPOSITIONS.UNSUMMARISED}\`. If the producer RETIRED it ` +
          `because the verbs now emit verdicts, that is R-073 working — remove the term from ` +
          `NamedHole.contract.ts and delete this test. If not, the halves have drifted.`,
      ).toBe(true);
    }
  });

  it("and it still enforces `unentitled` as the only hole — the control", () => {
    // Without this, a producer file that had merely stopped mentioning dispositions at all would
    // pass the assertion above by accident once the term was removed. This is the positive
    // control on the reach of the read: the file really is the one enforcing this vocabulary.
    expect(FOUND.length, "nothing to read — see the assertion above").toBeGreaterThan(0);
    for (const file of FOUND) {
      const src = readFileSync(file, "utf8");
      expect(src.includes(DISPOSITIONS.UNENTITLED), file).toBe(true);
    }
  });
});
