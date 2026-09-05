/**
 * "REMOVED" AND "NOT TAKEN" ARE DIFFERENT EVENTS AND MUST NOT SHARE A BLOCK.
 *
 * A verb under "verbs not taken" was eligible and lost a comparison. A verb under "candidates
 * removed" never reached the classifier: a gate deleted it, and the record afterwards showed
 * only the survivors — which is why an abstention on a pool of one read as "the classifier was
 * not sure" when the answer had been deleted before it looked.
 *
 * Rendered rather than asserted against source, because the store seeds in one line and what
 * matters here is what a reader ends up seeing.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DecisionPathDiagram } from "./DecisionPathDiagram";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { Artifact, RouteDecision } from "@/api/types";

const routing = (over: Partial<RouteDecision> = {}): RouteDecision =>
  ({
    about: { label: "Capability", uri: "mesh:Capability", confidence: 0.92 },
    action: {
      label: "Plan capability path",
      iri: "mesh:planCapabilityPath",
      confidence: 0.9,
      classify_called: true,
      candidate_count: 1,
    },
    ...over,
  }) as RouteDecision;

function seed(r: RouteDecision) {
  useCanvasStore.setState({
    artifacts: [{ id: "a1", routing: r } as unknown as Artifact],
    currentArtifactId: "a1",
  });
}

beforeEach(() => useCanvasStore.setState({ artifacts: [], currentArtifactId: null }));
afterEach(cleanup);

const arity = { verb: "mesh:planCapabilityPath", gate: "arity", reason: "needs an instance" };

describe("what a gate removed is shown", () => {
  it("names the verb, the gate and the gate's own reason", () => {
    // The line the HUD could not say. It said "no confident action".
    seed(routing({ excluded: [arity] }));
    render(<DecisionPathDiagram />);
    const block = document.querySelector("[data-removed-candidates]")!;
    expect(block).toBeTruthy();
    expect(block.textContent).toContain("planCapabilityPath");
    expect(block.textContent).toContain("arity");
    expect(block.textContent).toContain("needs an instance");
  });

  it("renders on an ANSWERED decision, not only on an abstention", () => {
    // A gate that removed the better verb while a worse one survived is the same defect with
    // an answer on top of it — and that case shows no fallback at all, so a block gated on
    // `fallback` would never draw for it.
    seed(routing({ excluded: [arity] }));
    render(<DecisionPathDiagram />);
    expect(document.querySelector("[data-removed-candidates]")).toBeTruthy();
    expect(document.querySelector("[data-removed-gate='arity']")).toBeTruthy();
  });

  it("draws NOTHING when the record carries no exclusions", () => {
    // The field is not on the wire yet and most records will not carry it for a long while. A
    // block reading "0 removed" would be a measurement nobody took.
    seed(routing());
    render(<DecisionPathDiagram />);
    expect(document.querySelector("[data-removed-candidates]")).toBeNull();
  });

  it("an UNKNOWN gate renders exactly as given", () => {
    // The seal that matters most: the next gate anyone adds inherits the trace. A mapping table
    // here would render it as an unknown token — the silent-removal defect one layer up.
    seed(routing({ excluded: [{ verb: "mesh:z", gate: "budget-envelope", reason: "over ceiling" }] }));
    render(<DecisionPathDiagram />);
    const block = document.querySelector("[data-removed-candidates]")!;
    expect(block.textContent).toContain("budget-envelope");
    expect(block.textContent).toContain("over ceiling");
  });

  it("is a SEPARATE block from the verbs that merely lost", () => {
    // Same panel, different claim. Collapsing them would say a deleted verb was considered.
    seed(routing({ excluded: [arity] }));
    render(<DecisionPathDiagram />);
    const removed = document.querySelector("[data-removed-candidates]")!;
    expect(removed.textContent).toContain("candidates removed (eligibility)");
    expect(removed.textContent).not.toContain("verbs not taken");
  });
});

describe("the abstention message distinguishes the two cases", () => {
  it("says something fit and was removed, when something was", () => {
    seed(routing({ fallback: true, fallback_reason: "no_verb_classified", excluded: [arity] }));
    render(<DecisionPathDiagram />);
    // The user's cue to rephrase with a name — unreachable while the panel said only that the
    // classifier was not confident. Asserted on the ABSTENTION TEXT specifically: the removed
    // block below also carries this reason, and a loose text query would pass on that alone
    // while the message itself still said nothing.
    const detail = document.querySelector("[data-fallback-detail]")!;
    expect(detail, "no abstention detail rendered").toBeTruthy();
    expect(detail.textContent).toContain("needs an instance");
    expect(detail.textContent).toContain("planCapabilityPath");
    // Both places say it, which is the point: the message explains and the block enumerates.
    expect(screen.getAllByText(/needs an instance/).length).toBeGreaterThan(1);
  });

  it("and stays exactly as it was when nothing was removed", () => {
    seed(routing({ fallback: true, fallback_reason: "no_verb_classified" }));
    render(<DecisionPathDiagram />);
    expect(document.body.textContent).not.toMatch(/was removed by/);
    expect(document.querySelector("[data-removed-candidates]")).toBeNull();
  });
});
