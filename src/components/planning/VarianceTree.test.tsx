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
import { readFileSync } from "node:fs";
import path from "node:path";
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
    // The reason is now a TAG carrying the producer's own token, with the sentence on hover.
    // A reader scanning a branch for "why does this stop here" sees the tag; a reader who wants
    // the sentence gets it without it occupying a line on every leaf.
    const { container } = render(<VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: 1 }]} />);
    const tag = container.querySelector('[data-stop-reason="leaf"]')!;
    expect(tag).toBeTruthy();
    expect(tag.textContent).toContain("leaf");
    expect(tag.getAttribute("title")).toMatch(/nothing beneath this in the model/);
  });

  it("distinguishes IMMATERIAL from leaf", () => {
    // Same absence of children, entirely different fact: one has nothing beneath it, the other
    // has plenty and it does not matter.
    render(
      <VarianceTree
        rows={[{ ...leaf("CA", -20), stop_reason: "explained", share_of_root: 0.02 }]}
      />,
    );
    const tag = document.querySelector('[data-stop-reason="explained"]')!;
    expect(tag).toBeTruthy();
    expect(tag.getAttribute("title")).toMatch(/immaterial against the total/);
    // And it is NOT the leaf sentence — same absence of children, entirely different fact.
    expect(document.querySelector('[data-stop-reason="leaf"]')).toBeNull();
  });

  it("says when the ANALYSIS hit its own depth limit", () => {
    render(<VarianceTree rows={[{ ...leaf("CA", -400), stop_reason: "depth", share_of_root: 0.4 }]} />);
    const tag = document.querySelector('[data-stop-reason="depth"]')!;
    expect(tag).toBeTruthy();
    expect(tag.getAttribute("title")).toMatch(/the analysis stopped here at its own depth limit/);
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
  it("tells the reader the shares are of the TOTAL, and the inspector repeats it per node", () => {
    // The CLAIM is unchanged: against its parent a small variance inside a small account can be
    // half of it, so an unqualified "share" invites the reading that makes a trivial node look
    // like the problem.
    //
    // WHAT CHANGED, AND WHY THIS IS A NARROWING RATHER THAN A WEAKENING. It used to require
    // "% of total" on EVERY ROW. The rows now carry a bare percentage in a fixed column, with
    // the qualifier stated once beneath the tree — because repeating four words on every row of
    // a nested list is the kind of noise a reader stops seeing, and a label nobody reads is not
    // a label. The qualifier is still stated, and the INSPECTOR still names it per node, which
    // is where a reader goes when they want to be sure about one number.
    //
    // If that trade is wrong the fix is to put the words back on the rows — not to delete this
    // test, which is what a genuine weakening would have looked like.
    render(<VarianceTree rows={deepTree()} />);
    expect(screen.getByText(/shares are of the TOTAL, not of the parent/)).toBeTruthy();

    // And per node, on demand.
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(screen.getAllByText(/% of total/).length).toBeGreaterThan(0);
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

/**
 * THE SHARE IS DRAWN, AND ITS COLOUR IS THE PRODUCER'S OR NOBODY'S.
 *
 * A column of percentages is read one number at a time; a bar is read as a shape, which is what
 * "which of these is the problem" actually asks. But the bar's COLOUR is a verdict, and this
 * node carries no `favourable` today — a positive cost variance is favourable and a positive
 * schedule variance is not, so colouring from `variance > 0` would be right on one
 * `variance_kind` and wrong on the next. Neutral until the producer says.
 */
describe("the share bar states no verdict it was not given", () => {
  const node = (over: Record<string, unknown> = {}) => [
    { ...leaf("WP", -400), share_of_root: 0.4, ...over },
  ];

  it("is NEUTRAL when the producer has not said whether the variance is welcome", () => {
    // Every node today. A share is still a share when nobody has said whether it is good.
    const { container } = render(<VarianceTree rows={node()} />);
    const bar = container.querySelector("[data-variance-node] span[style]") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.className).not.toMatch(/rose|emerald/);
  });

  it("takes the producer's verdict when there IS one", () => {
    const { container } = render(<VarianceTree rows={node({ favourable: false })} />);
    const bar = container.querySelector("[data-variance-node] span[style]") as HTMLElement;
    expect(bar.className).toMatch(/rose/);
    cleanup();
    const ok = render(<VarianceTree rows={node({ favourable: true })} />);
    const good = ok.container.querySelector("[data-variance-node] span[style]") as HTMLElement;
    expect(good.className).toMatch(/emerald/);
  });

  it("derives no verdict from the sign — the VERDICT function reads only the declaration", () => {
    // NARROWED, and the narrowing matters. The first version banned `variance > 0` anywhere in
    // the file, which also bans showing the sign at all — and rendering "+1.2K" for a positive
    // number is displaying the sign, not judging it. The ban belongs on the function that
    // decides the VERDICT, not on the whole component.
    const raw = readFileSync(path.join(__dirname, "VarianceTree.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const fn of ["function barTone", "function verdictTag"]) {
      const start = src.indexOf(fn);
      expect(start, fn + " is missing").toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf("\n}", start));
      expect(body, fn + " reads the verdict").toContain("node.favourable");
      expect(body, fn + " infers from the sign").not.toMatch(/variance/);
    }
  });

  it("a null share draws no bar rather than a full one", () => {
    // Width from an absent share must not fall back to 100% — that would draw the loudest
    // possible mark for the case where nothing is known.
    const { container } = render(<VarianceTree rows={node({ share_of_root: null })} />);
    const bar = container.querySelector("[data-variance-node] span[style]") as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });
});

describe("the value column is aligned across depths", () => {
  it("the amount sits in a FIXED column, so numbers do not drift right with indentation", () => {
    // The defect this fixes is specific to trees: the label is indented, and a value laid out
    // after it moves right with every level — which puts the figures a reader is comparing on a
    // diagonal. jsdom computes no layout, so the fixed width is asserted on the class the
    // browser would lay out from; a rendered-geometry assertion here would read zeros.
    const { container } = render(<VarianceTree rows={deepTree()} />);
    const rows = [...container.querySelectorAll("[data-variance-node]")];
    expect(rows.length).toBeGreaterThan(1); // positive control: more than one depth is drawn
    for (const r of rows) {
      // Matched on a NUMBER, not on a currency symbol: this fixture declares no unit, so
      // `formatAmount` correctly renders "-1.0K" with no `$` — and an assertion anchored on the
      // symbol found nothing and reported the column missing rather than the anchor being wrong.
      const amount = [...r.querySelectorAll("span")].find((el) =>
        /^[-+]?\$?[\d.]+[KMB]?$/.test((el.textContent ?? "").trim()),
      );
      expect(amount, "a row draws no amount").toBeTruthy();
      expect(amount!.className, "the amount column is not fixed-width").toMatch(/\bw-\d+\b/);
      expect(amount!.className).toMatch(/flex-shrink-0/);
    }
  });
});

describe("the bar is a column, not a second line", () => {
  it("sits BETWEEN the amount and the percent, at a fixed width", () => {
    // A full-width bar under each row turns a compact tree into a stack of two-line entries and
    // puts the mark a long way from the figure it encodes. Beside the percent it reads as the
    // same fact twice — once as a shape, once as a number.
    //
    // COMPARED BY DOCUMENT POSITION, not by index in a flattened span list. The first version
    // indexed into `querySelectorAll("span")`, which includes wrappers and spacers, so the
    // numbers it compared were positions in a list nobody laid out — and it reported the bar as
    // mis-ordered when the query was what was wrong.
    const { container } = render(<VarianceTree rows={deepTree()} />);
    const row = container.querySelector("[data-variance-node]")!;
    const bar = row.querySelector("[data-share-bar]")!;
    const spans = [...row.querySelectorAll("span")];
    const amount = spans.find((el) =>
      /^[-+]?\$?[\d.]+[KMB]?$/.test((el.textContent ?? "").trim()),
    );
    const pct = spans.find((el) => /^-?[\d.]+%$/.test((el.textContent ?? "").trim()));

    expect(bar, "no share bar").toBeTruthy();
    expect(amount, "no amount column").toBeTruthy();
    expect(pct, "no percent column").toBeTruthy();

    // DOCUMENT_POSITION_FOLLOWING === 4: the bar comes after the amount, the percent after the bar.
    expect(amount!.compareDocumentPosition(bar) & 4, "the bar is not after the amount").toBe(4);
    expect(bar.compareDocumentPosition(pct!) & 4, "the percent is not after the bar").toBe(4);
  });

  it("the bar column is fixed-width, so it aligns across depths like the others", () => {
    const { container } = render(<VarianceTree rows={deepTree()} />);
    const tracks = [...container.querySelectorAll("[data-share-bar]")];
    expect(tracks.length).toBeGreaterThan(1); // positive control: several depths draw one
    for (const track of tracks) {
      expect(track.className).toMatch(/\bw-\d+\b/);
      expect(track.className).not.toMatch(/w-full/);
    }
  });
});

describe("depth and verdict survive a projector", () => {
  it("draws ONE RAIL PER LEVEL, so depth is countable rather than measured", () => {
    // Indentation alone is a distance the eye measures against a card edge that scrolls away.
    const { container } = render(<VarianceTree rows={deepTree()} />);
    for (const row of container.querySelectorAll("[data-variance-node]")) {
      const depth = Number(row.getAttribute("data-depth"));
      expect(row.querySelectorAll("[data-depth-rail]").length, `depth ${depth}`).toBe(depth);
    }
  });

  it("the verdict is a WORD, not only a colour", () => {
    // Rose and teal are the second channel, never the only one — the projector rule from the
    // funding grid and the ranking, applied to a tree.
    const { container } = render(
      <VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: 1, favourable: false }]} />,
    );
    const tag = container.querySelector("[data-verdict-tag]")!;
    expect(tag).toBeTruthy();
    expect(tag.textContent).toMatch(/adv/i);
  });

  it("shows NO verdict word when the producer states none", () => {
    // Every node today. An unstated verdict must not acquire one from a default.
    const { container } = render(<VarianceTree rows={[{ ...leaf("WP", -100), share_of_root: 1 }]} />);
    expect(container.querySelector("[data-verdict-tag]")).toBeNull();
  });

  it("shows the SIGN on the amount, plus included", () => {
    const { container } = render(
      <VarianceTree rows={[{ ...leaf("WP", 400), share_of_root: 0.4 }]} />,
    );
    expect(container.querySelector("[data-variance-node]")!.textContent).toMatch(/\+/);
  });
});
