/**
 * TWO TRUNCATIONS, AND THE WHOLE ARCHETYPE TURNS ON KEEPING THEM APART.
 *
 * The producer reports why IT stopped on every node — `leaf`, `explained`, `depth` — because
 * "a truncated tree that looks complete is the failure this field exists to prevent". Three
 * different facts that produce the identical absence of children.
 *
 * This card ALSO stops, at MAX_RENDER_DEPTH, and that is a different claim entirely: the
 * analysis went further, the card is not drawing it yet. Rendering them as one "nothing
 * further" line would tell the reader the analysis was shallower than it was — the producer's
 * own failure mode, reproduced by the renderer that was written to honour it.
 *
 * The other rule is arithmetic honesty: contributors that do not sum to their parent is "the
 * arithmetic lie this engine is most likely to tell", so the producer reports the immaterial
 * remainder and a card that dropped it would let the children look complete.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { VarianceTree } from "./VarianceTree";
import { MAX_RENDER_DEPTH, depthBelow, countBelow } from "./VarianceTree.contract";

afterEach(cleanup);

const leaf = (name: string, variance: number, extra = {}) => ({
  level: "work_package",
  entity_id: name,
  entity_name: name,
  variance,
  share_of_root: variance / 1000,
  stop_reason: "leaf",
  ...extra,
});

/** A tree deeper than the card draws, so the two truncations are both in play. */
const deepTree = () => [
  {
    level: "program",
    entity_id: "P",
    entity_name: "Meridian",
    variance: -1000,
    share_of_root: 1,
    stop_reason: "decomposed",
    bcws: 5000,
    bcwp: 4000,
    acwp: 5000,
    contributors: [
      {
        level: "control_account",
        entity_id: "CA1",
        entity_name: "CA 3.1",
        variance: -700,
        share_of_root: 0.7,
        stop_reason: "decomposed",
        contributors: [
          {
            level: "work_package",
            entity_id: "WP1",
            entity_name: "WP 3.1.1",
            variance: -500,
            share_of_root: 0.5,
            stop_reason: "decomposed",
            contributors: [
              {
                level: "task",
                entity_id: "T1",
                entity_name: "Task A",
                variance: -300,
                share_of_root: 0.3,
                stop_reason: "decomposed",
                contributors: [leaf("Subtask A1", -200)],
              },
            ],
          },
        ],
      },
    ],
  },
];

describe("the producer's stopping reason is rendered, never inferred", () => {
  it("says WHY a childless node has no children — leaf", () => {
    render(<VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: 1 }]} />);
    expect(screen.getByText(/nothing beneath this in the model/)).toBeTruthy();
  });

  it("distinguishes IMMATERIAL from leaf", () => {
    // Same absence of children, entirely different fact: one has nothing beneath it, the other
    // has plenty and it does not matter.
    render(
      <VarianceTree
        rows={[{ ...leaf("CA", -20), stop_reason: "explained", share_of_root: 0.02 }]}
      />,
    );
    expect(screen.getByText(/immaterial against the total/)).toBeTruthy();
    expect(screen.queryByText(/nothing beneath this/)).toBeNull();
  });

  it("says when the ANALYSIS hit its own depth limit", () => {
    render(<VarianceTree rows={[{ ...leaf("CA", -400), stop_reason: "depth", share_of_root: 0.4 }]} />);
    expect(screen.getByText(/the analysis stopped here at its own depth limit/)).toBeTruthy();
  });

  it("says NOTHING for a node that was decomposed — silence is the right output", () => {
    render(<VarianceTree rows={deepTree()} />);
    const stops = document.querySelectorAll("[data-stop-reason]");
    for (const el of stops) {
      expect(el.getAttribute("data-stop-reason")).not.toBe("decomposed");
    }
  });

  it("renders an UNKNOWN stop reason verbatim rather than mapping it to a neighbour", () => {
    // Same rule IntervalTimeline follows for risk_flag: an unfamiliar value is shown as itself,
    // because guessing which known reason it resembles invents a fact.
    render(
      <VarianceTree rows={[{ ...leaf("X", -50), stop_reason: "abandoned", share_of_root: 0.05 }]} />,
    );
    expect(screen.getByText("abandoned")).toBeTruthy();
  });
});

describe("the card's own limit is a different statement from the analysis's", () => {
  it("stops drawing at MAX_RENDER_DEPTH", () => {
    render(<VarianceTree rows={deepTree()} />);
    const depths = [...document.querySelectorAll("[data-variance-node]")].map((el) =>
      Number(el.getAttribute("data-depth")),
    );
    expect(Math.max(...depths)).toBeLessThan(MAX_RENDER_DEPTH);
  });

  it("SAYS what it is not drawing, in the card's own voice", () => {
    // Not "nothing further" — that is the analysis's sentence and this is the card's.
    render(<VarianceTree rows={deepTree()} />);
    const limit = document.querySelector("[data-render-limit]");
    expect(limit).not.toBeNull();
    expect(limit!.textContent).toMatch(/more below/);
    expect(limit!.textContent).toMatch(/level/);
  });

  it("counts what is hidden rather than merely admitting there is more", () => {
    // "2 more below, 2 levels deep" is actionable; "more available" is not.
    render(<VarianceTree rows={deepTree()} />);
    expect(document.querySelector("[data-render-limit]")!.textContent).toMatch(/\d+ more below/);
  });

  it("the hidden depth can be OPENED — the payload carries it, the card was just not drawing it", () => {
    render(<VarianceTree rows={deepTree()} />);
    const before = document.querySelectorAll("[data-variance-node]").length;
    fireEvent.click(document.querySelector("[data-render-limit]")!);
    expect(document.querySelectorAll("[data-variance-node]").length).toBeGreaterThan(before);
  });

  it("a tree WITHIN the limit shows no render-limit line at all", () => {
    // Positive control on the negatives above: without this, "says what it is not drawing"
    // would pass on a card that always claims to be hiding something.
    render(<VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: 1 }]} />);
    expect(document.querySelector("[data-render-limit]")).toBeNull();
  });
});

describe("arithmetic honesty", () => {
  it("renders the residual the producer declined to enumerate", () => {
    render(
      <VarianceTree
        rows={[
          {
            ...leaf("P", -1000),
            level: "program",
            stop_reason: "decomposed",
            share_of_root: 1,
            contributors: [leaf("CA1", -700)],
            residual: -300,
            residual_note: "4 contributor(s) below the 5% materiality floor, netting -300 USD",
          },
        ]}
      />,
    );
    expect(screen.getByText(/below the 5% materiality floor/)).toBeTruthy();
  });

  it("shows a residual even when the producer sent no note for it", () => {
    // The number is the honest part; the sentence is a courtesy. Dropping the row because the
    // courtesy is missing would hide the arithmetic gap.
    render(
      <VarianceTree
        rows={[
          {
            ...leaf("P", -1000),
            level: "program",
            stop_reason: "decomposed",
            share_of_root: 1,
            contributors: [leaf("CA1", -700)],
            residual: -300,
          },
        ]}
        value_unit="USD"
      />,
    );
    const el = document.querySelector("[data-residual]");
    expect(el).not.toBeNull();
    // NOT MERELY PRESENT. An empty <p> is an element that exists and says nothing — which is
    // exactly what dropping the fallback produces, and it passed a presence check.
    expect((el!.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(el!.textContent).toContain("300");
  });

  it("shows NO residual line when there is none", () => {
    render(<VarianceTree rows={deepTree()} />);
    expect(document.querySelector("[data-residual]")).toBeNull();
  });
});

describe("the share is of the ROOT and the card says so", () => {
  it("labels every share as a share of the total", () => {
    // Against its parent a small variance inside a small account can be half of it. An
    // unqualified "share" invites the reading that makes a trivial node look like the problem.
    render(<VarianceTree rows={deepTree()} />);
    expect(screen.getAllByText(/% of total/).length).toBeGreaterThan(0);
    expect(screen.getByText(/shares are of the TOTAL, not of the parent/)).toBeTruthy();
  });

  it("a null share renders absent, never 0%", () => {
    render(<VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: null }]} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/0% of total/)).toBeNull();
  });
});

describe("depth and count are read from the payload, not assumed", () => {
  it("depthBelow and countBelow walk the real tree", () => {
    const root = deepTree()[0];
    expect(depthBelow(root)).toBe(4);
    expect(countBelow(root)).toBe(4);
  });

  it("refuses a payload with no root", () => {
    render(<VarianceTree rows={[]} />);
    expect(screen.getByText(/no decomposition recorded/)).toBeTruthy();
  });

  it("refuses a root with no variance", () => {
    render(<VarianceTree rows={[{ level: "program", entity_id: "P", entity_name: "P" }]} />);
    expect(screen.getByText(/root carries no variance/)).toBeTruthy();
  });
});
