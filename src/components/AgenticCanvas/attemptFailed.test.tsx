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
import { readExclusions } from "@/lib/routing";
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
