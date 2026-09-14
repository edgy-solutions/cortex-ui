/**
 * A FAILED ARTIFACT RENDERED IDENTICALLY TO AN EMPTY SUCCESSFUL ONE.
 *
 * A finance brief came back `status: failed`, `rendered_output` 0 bytes, with an `excluded[]`
 * naming the gate that removed the verb. The canvas tile drew the summary line and nothing
 * else — the same as a successful answer that produced no components, and the same as one still
 * in flight. **`status` was in the row the whole time and that surface did not read it.**
 *
 * It cost two hours and three reads of the artifact store to establish what the row already
 * said.
 *
 * ── AND THE TRACE WAS BEING DROPPED BY ITS OWN READER ─────────────────────────────────────
 *
 * `readExclusions` required a `verb` field and discarded any row without one. The producer
 * emits `uri` — measured at `direct_dispatch.py:510` in the serving pod — so EVERY ARITY
 * EXCLUSION WAS SILENTLY DISCARDED. The contract above that function says *a silent removal is
 * indistinguishable from "there was never an answer"*, and the reader written to prevent that
 * was removing them silently, over a field name.
 *
 * ── WHAT THESE SEALS CANNOT DISTINGUISH ───────────────────────────────────────────────────
 *
 * They cannot tell a gate that recorded no reason from one whose reason was lost in transit —
 * both arrive as an empty string and both render the gate alone. And they assert what the card
 * SAYS, never that the attempt truly failed: `status` is the producer's claim and this surface
 * reports it rather than checking it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AttemptFailed } from "./AttemptFailed";
import { flagStanding, readExclusions, readExclusionSplit } from "@/lib/routing";
import type { Artifact } from "@/api/types";

afterEach(cleanup);

/** The shape the producer actually sends — `uri`, not `verb`. */
const LIVE_EXCLUSION = {
  uri: "mesh:finProgramBrief",
  gate: "arity",
  reason: "verb requires an instance; none was bound",
};

const artifact = (over: Record<string, unknown> = {}): Artifact =>
  ({
    id: "artifact-2-1789404372153",
    status: "failed",
    rendered_output: null,
    routing: { excluded: [LIVE_EXCLUSION] },
    ...over,
  }) as unknown as Artifact;

describe("the exclusion trace survives its own reader", () => {
  it("reads the producer's `uri`, which it was discarding", () => {
    // The defect, at the reader. Before this, every arity exclusion vanished here and the
    // decision path showed nothing removed.
    const rows = readExclusions([LIVE_EXCLUSION]);
    expect(rows).toHaveLength(1);
    expect(rows[0].verb).toBe("mesh:finProgramBrief");
    expect(rows[0].gate).toBe("arity");
  });

  it("still reads `verb`, and prefers it when both are present", () => {
    // The declared name stays primary — the control that stops this becoming a rename.
    expect(readExclusions([{ verb: "a:X", gate: "domain" }])[0].verb).toBe("a:X");
    expect(readExclusions([{ verb: "a:X", uri: "a:Y", gate: "domain" }])[0].verb).toBe("a:X");
  });

  it("still drops a row that names no verb under EITHER key", () => {
    // Widening the reader must not make it credulous: a row naming nothing cannot be reported.
    expect(readExclusions([{ gate: "arity", reason: "x" }])).toEqual([]);
    expect(readExclusions([{ uri: "   ", gate: "arity" }])).toEqual([]);
  });
});

describe("a failed attempt says so, and names the gate", () => {
  it("renders the failure and the exclusion", () => {
    render(<AttemptFailed artifact={artifact()} />);
    const note = document.querySelector("[data-attempt-failed]")!;
    expect(note).not.toBeNull();
    expect(note.textContent).toMatch(/this attempt failed/i);
    expect(note.textContent).toContain("finProgramBrief");
    expect(note.textContent).toContain("arity");
  });

  it("prints the gate's own words and invents none", () => {
    // `ExcludedCandidate`'s contract: the three fields are the producer's, read verbatim. This
    // surface has no vocabulary of gates and must not acquire one, or the next gate anyone adds
    // renders as an unknown token instead of inheriting the trace.
    render(<AttemptFailed artifact={artifact()} />);
    const note = document.querySelector("[data-attempt-failed]")!;
    expect(note.textContent).toContain("verb requires an instance; none was bound");
  });

  it("renders NOTHING for an artifact that did not fail — the control", () => {
    // Without this, a component that always drew the failure would pass everything above and
    // mark every answer on the board as failed.
    for (const status of ["complete", "pending"]) {
      const { unmount } = render(<AttemptFailed artifact={artifact({ status })} />);
      expect(document.querySelector("[data-attempt-failed]"), status).toBeNull();
      unmount();
    }
  });

  it("says a failure had NO TRACE rather than showing an empty list", () => {
    // Failed-and-unexplained is a different fact from failed-and-explained, and saying which
    // stops a reader hunting for a reason that was never recorded.
    render(<AttemptFailed artifact={artifact({ routing: { excluded: [] } })} />);
    expect(document.querySelector("[data-failure-untraced]")).not.toBeNull();
    expect(document.querySelector("[data-failure-exclusions]")).toBeNull();
  });

  it("says the same when routing is absent entirely", () => {
    render(<AttemptFailed artifact={artifact({ routing: null })} />);
    expect(document.querySelector("[data-attempt-failed]")).not.toBeNull();
    expect(document.querySelector("[data-failure-untraced]")).not.toBeNull();
  });

  it("names a gate that gave no reason, without inventing one", () => {
    render(
      <AttemptFailed
        artifact={artifact({ routing: { excluded: [{ uri: "a:X", gate: "permission" }] } })}
      />,
    );
    const note = document.querySelector("[data-attempt-failed]")!;
    expect(note.textContent).toContain("permission");
    expect(note.textContent).toContain("X");
  });

  it("folds an IRI to its local name the way the registry does", () => {
    render(
      <AttemptFailed
        artifact={artifact({
          routing: { excluded: [{ uri: "http://invincible-agent/mesh#finProgramBrief", gate: "arity" }] },
        })}
      />,
    );
    expect(document.querySelector("[data-attempt-failed]")!.textContent).toContain(
      "finProgramBrief",
    );
  });
});

describe("it is mounted on BOTH surfaces", () => {
  // A failure visible on one surface and blank on the other is the shape that makes a defect
  // look intermittent — and is exactly how this one survived: the full pane said "This attempt
  // failed." while the canvas tile, which is where a reader actually lands, said nothing.
  const src = (f: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("node:fs") as typeof import("node:fs")).readFileSync(
      (require("node:path") as typeof import("node:path")).join(__dirname, f),
      "utf8",
    );

  it("the canvas tile mounts it", () => {
    expect(src("StageCard.tsx")).toContain("<AttemptFailed");
  });

  it("the full pane mounts it", () => {
    expect(src("CanvasPane.tsx")).toContain("<AttemptFailed");
  });
});

/**
 * FLAGGED IS NOT REMOVED — the same key, opposite decisions.
 *
 * The arity gate STOPPED EXCLUDING on 2026-09-04: removing the only verb that fits abstains for
 * the reason it would have asked about, so it keeps the verb and marks it. Measured at
 * `direct_dispatch.py:507` in the serving pod (`cd924db`):
 *
 *     {"uri": ..., "gate": "arity", "reason": "needs_instance", "disposal": "flagged"}
 *
 * So a LIVE candidate rendered as "excluded by arity" — under a key whose name says deleted,
 * with a label asserting the reverse of the decision taken. And the reverse is the ACTIONABLE
 * half: a flagged verb tells the reader to supply the instance, while "excluded" tells them the
 * verb is gone and there is nothing to supply.
 *
 * ── MY OWN FIXTURE WAS THE PARAPHRASE, NOT THE WIRE ───────────────────────────────────────
 *
 * The exclusion fixture in this file carried no `disposal` at all, because I built it from a
 * description in a message rather than from the producer. It passed — as a REMOVAL — which is
 * exactly the mislabel being fixed. A fixture written from an account of the payload agrees
 * with the account, not with the payload.
 */
describe("a flagged candidate is not reported as removed", () => {
  /** The producer's real arity row. */
  const FLAGGED = {
    uri: "mesh:finProgramBrief",
    gate: "arity",
    reason: "needs_instance",
    disposal: "flagged",
  };
  /** A genuine removal, for the other half of the partition. */
  const REMOVED = {
    uri: "mesh:someOtherVerb",
    gate: "domain",
    reason: "out of scope",
    disposal: "removed",
  };

  it("partitions the two, and neither half is the other's leftovers", () => {
    const { removed, flagged } = readExclusionSplit([FLAGGED, REMOVED], undefined);
    expect(flagged.map((r) => r.verb)).toEqual(["mesh:finProgramBrief"]);
    expect(removed.map((r) => r.verb)).toEqual(["mesh:someOtherVerb"]);
  });

  it("treats an ABSENT disposal as removed — mislabel is visible, absence is not", () => {
    // Every row predating the field meant "removed", which is what the key name says. It can
    // mislabel an older flagged row; a disappearance could not be seen at all.
    const { removed, flagged } = readExclusionSplit([{ uri: "a:X", gate: "arity" }], undefined);
    expect(removed).toHaveLength(1);
    expect(flagged).toHaveLength(0);
  });

  it("does NOT absorb an unrecognised disposal into flagged", () => {
    // The partition's whole point. A `flagged` computed as "everything not removed" would take
    // any third disposal the gate ever adds and render it as a live candidate — a claim about a
    // decision, made from not recognising a word.
    const { removed, flagged } = readExclusionSplit(
      [{ uri: "a:X", gate: "arity", disposal: "deferred" }],
      undefined,
    );
    expect(flagged).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it("reads the producer's newer `flags` key as flagged regardless of the row's own field", () => {
    // A row arriving under that key is one the gate kept; the key is the claim.
    const { removed, flagged } = readExclusionSplit(undefined, [{ uri: "a:X", gate: "arity" }]);
    expect(flagged).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it("DE-DUPLICATES across the additive window, where both keys carry the same row", () => {
    // The producer added `flags` without narrowing `excluded`, on purpose, so this reader is
    // not the second place an arity row vanishes. Reading both naively lists every flagged
    // candidate twice, and the fix would look like a new defect.
    const { removed, flagged } = readExclusionSplit([FLAGGED], [FLAGGED]);
    expect(flagged).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it("the CARD says kept-and-flagged, never excluded", () => {
    render(<AttemptFailed artifact={artifact({ routing: { excluded: [FLAGGED] } })} />);
    const flags = document.querySelector("[data-failure-flags]")!;
    expect(flags).not.toBeNull();
    expect(flags.textContent).toContain("finProgramBrief");
    expect(flags.textContent).toMatch(/asked rather than excluded/i);
    // And it must not also appear as a removal.
    expect(document.querySelector("[data-failure-exclusions]")).toBeNull();
  });

  it("a failure explained ONLY by flags is explained — not 'no trace'", () => {
    // `data-failure-untraced` means nothing was recorded. A flagged candidate IS the record.
    render(<AttemptFailed artifact={artifact({ routing: { excluded: [FLAGGED] } })} />);
    expect(document.querySelector("[data-failure-untraced]")).toBeNull();
  });

  it("still reports a genuine removal as removed — the control", () => {
    // Without this, a card that rendered everything as a flag would pass every assertion above
    // while telling a reader that a domain-excluded verb is waiting for an instance.
    render(<AttemptFailed artifact={artifact({ routing: { excluded: [REMOVED] } })} />);
    expect(document.querySelector("[data-failure-exclusions]")).not.toBeNull();
    expect(document.querySelector("[data-failure-flags]")).toBeNull();
  });
});

/**
 * THE JOIN BETWEEN TWO DECLARATIONS OF ONE FACT — a regression guard, NOT a population split.
 *
 * ⛔ THESE TESTS CANNOT TELL YOU THE WORLD PRODUCES A CONTRADICTED ROW. They prove the renderer
 * behaves correctly when handed one, and the fixture is the thing handing it over. That is the
 * gap between a guard being RIGHT and a guard being REACHABLE, and only the first is sealed
 * here.
 *
 * It is unreachable today. `instance_resolved` is `bool(subject_instance_id)` (gateway.py:3340,
 * :3399) and the gate flags on `not subject_instance_id` (dynamic_supervisor.py:956), off one
 * variable assigned once at direct_dispatch.py:198 and never reassigned before either read. So
 * ZERO CONTRADICTED MEANS NOTHING ABOUT DEFECTS — do not let a clean panel be read as evidence.
 *
 * AND THE DEFECT THIS WAS BUILT FOR WOULD NOT TRIP IT: on NP-MERIDIAN both halves said "no
 * instance" and both were wrong, the bound value being in the chain's slots where neither
 * looked. Self-consistent and false is precisely the case a consistency check cannot see.
 *
 * It ships as the guard on the JOIN: two declarations of one fact, rendered on separate surfaces
 * since June, each happy alone. If someone ever makes the gate read a different field than the
 * projection reports, this is the only thing watching.
 */
describe("the two declarations of the instance fact are joined, not merely rendered", () => {
  const FLAG = {
    uri: "mesh:finProgramBrief",
    gate: "arity",
    reason: "needs_instance",
    disposal: "flagged",
  };
  const withInstance = (instance_resolved?: boolean) =>
    artifact({
      routing: {
        excluded: [FLAG],
        about: instance_resolved === undefined ? {} : { instance_resolved },
      },
    });

  it("calls it CONTRADICTED when an instance resolved on the same turn", () => {
    render(<AttemptFailed artifact={withInstance(true)} />);
    const row = document.querySelector("[data-flag-standing]")!;
    expect(row).not.toBeNull();
    expect(row.getAttribute("data-flag-standing")).toBe("contradicted");
    expect(row.textContent).toMatch(/contradicts the record/i);
  });

  it("calls it CONSISTENT when no instance resolved — THE CONTROL", () => {
    // Without this, a surface that stamped "contradicted" on every flag would pass the test
    // above and report the whole pre-fix population as defects. This is the assertion that
    // makes the one above mean something.
    render(<AttemptFailed artifact={withInstance(false)} />);
    const row = document.querySelector("[data-flag-standing]")!;
    expect(row.getAttribute("data-flag-standing")).toBe("consistent");
    expect(row.textContent).not.toMatch(/contradicts the record/i);
  });

  it("treats an ABSENT instance_resolved as no contradiction, not as a false", () => {
    // A record that never carried the fact cannot deny anything with it. Voting absence into
    // either pile is a claim made from a field that was never sent.
    render(<AttemptFailed artifact={withInstance(undefined)} />);
    expect(document.querySelector("[data-flag-standing]")!.getAttribute("data-flag-standing")).toBe(
      "consistent",
    );
  });

  it("claims nothing from a gate it does not recognise", () => {
    // Announcing a defect from not recognising a word is the error the partition above exists
    // to avoid; here it would send someone hunting a bug that is not there.
    expect(flagStanding({ verb: "a:X", gate: "budget", reason: "over cap" }, true)).toBe(
      "consistent",
    );
  });

  it("reads the producer's reason as well as the gate name", () => {
    // The gate label is the weaker signal — a renamed gate must not silently stop the check.
    expect(flagStanding({ verb: "a:X", gate: "", reason: "needs_instance" }, true)).toBe(
      "contradicted",
    );
    expect(flagStanding({ verb: "a:X", gate: "ARITY", reason: "" }, true)).toBe("contradicted");
  });

  it("the OTHER surface carries the same discriminator", () => {
    // A defect visible on the canvas card and blank in the HUD is the intermittent shape this
    // file already paid for once.
    const src = (require("node:fs") as typeof import("node:fs")).readFileSync(
      (require("node:path") as typeof import("node:path")).join(
        __dirname,
        "..",
        "HUD",
        "DecisionPathDiagram.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("flagStanding");
    expect(src).toContain("data-flag-standing");
  });
});
