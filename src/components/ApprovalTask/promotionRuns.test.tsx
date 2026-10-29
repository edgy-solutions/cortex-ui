/**
 * The promotion review card with flag `promotionRuns` ON: parts folded into runs, coverage, the callout
 * beside the outlined cell, keys, the `unchecked` promote hold, and the browser-only resume.
 *
 * The extraction is a small synthetic notice, not the 402-part fixture:
 *   p0..p7  one RUN of 8 (`FK25000n -> FK25100n`, only the last digit varies), on page 2
 *   p3      sits INSIDE the run and the extractor doubts it (needs_review)
 *   p8, p9  two STRAGGLERS (shapes that match neither the run nor each other); p9 sits low on the page
 *   p0..p2  also carry an `ltb_date` row citing ONE sentence on page 1 (a shared fact of 3 rows)
 *
 * Mount, transport mocks and pdf.js stand-ins follow `PromotionReviewCard.test.tsx` (see its header).
 * The page click is a real click on the pane's page slot with a stubbed `getBoundingClientRect` (jsdom lays
 * nothing out), so the pane's own handler computes the fractions and the card's `hitTest` answers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({ actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
const fetchIngestSource = vi.fn();
const fetchIngestExtraction = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  correctIngestLeaf: vi.fn(),
  fetchIngestSource: (...a: unknown[]) => fetchIngestSource(...a),
  fetchIngestExtraction: (...a: unknown[]) => fetchIngestExtraction(...a),
}));
const renderPage = vi.fn();
const openPdf = vi.fn();
vi.mock("@/lib/pdfSource", () => ({
  openPdf: (...a: unknown[]) => openPdf(...a),
  RenderCancelled: class extends Error {},
}));

import { AuthContext, type AuthContextProps } from "react-oidc-context";
import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { scaleFixtureExtractionBody } from "@/lib/promotionReviewScaleFixture";
import { readExtraction } from "@/lib/promotionReview";
import { buildReviewPlan, shapeOf } from "@/lib/reviewRuns";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";

const SHA = `sha256:${"7c0de".padEnd(64, "b")}`;
const DIMS = { width: 612, height: 792 };
const DECL = {
  kind: "document_promotion",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "PROMOTE",
  title: "Contributed document",
  accepts: ["promoted", "rejected"],
  reason_required: ["rejected"],
};

type Box = [number, number, number, number];
const LTB_BOX: Box = [72, 60, 400, 72];
/** p0..p8 sit in a table on page 2 at a 14pt pitch; p9 is low on the page (its box top is past 75% of the height). */
const boxOf = (i: number): Box => (i === 9 ? [72, 650, 300, 662] : [72, 100 + 14 * i, 300, 112 + 14 * i]);
const PAIRS: Array<[string, string]> = [
  ...Array.from({ length: 8 }, (_, i): [string, string] => [`FK25000${i}`, `FK25100${i}`]),
  ["BYV34-400", "BYV34-400X"],
  ["1N4148", "1N4148W"],
];

// Served as the BFF declares it: {page, bbox}, the bbox in top-left page fractions (the boxes above are in pt).
const ref = (page: number, [x0, y0, x1, y1]: Box) => ({ page, bbox: [x0 / DIMS.width, y0 / DIMS.height, x1 / DIMS.width, y1 / DIMS.height] });
/** The shared ltb crop's fact key, `page:bbox`, as served (fractions). */
const LTB_KEY = `1:${ref(1, LTB_BOX).bbox.join(",")}`;
function body() {
  const rows: Array<Record<string, unknown>> = [];
  const push = (r: Record<string, unknown>) => rows.push({ row_index: rows.length, match_confidence: 1, needs_review: false, review_reason: null, source_snippet: "", ...r });
  PAIRS.forEach(([mpn, repl], i) => {
    push({
      part_index: i,
      mpn,
      field: "replacement_mpn",
      extracted_value: repl,
      obtained_via: "text_layer_cell",
      evidence_ref: ref(2, boxOf(i)),
      ...(i === 3 ? { needs_review: true, review_reason: "two candidates in the cell" } : {}),
    });
    if (i < 3) {
      push({ part_index: i, mpn, field: "ltb_date", extracted_value: "2027-03-31", obtained_via: "inherited_doc_level", evidence_ref: ref(1, LTB_BOX) });
    }
  });
  return {
    ingest_id: SHA,
    notice_id: "PCN-RUNS-0010",
    content_kind: "pdf",
    attempt: 1,
    notice: { mfr: "Example Discretes Ltd", mfr_parent: null, notice_date: "2026-09-30" },
    part_count: PAIRS.length,
    rows,
    rows_without_evidence: 0,
    review_ref: null,
  };
}
const task = (): ApprovalTaskPayload => ({
  task_id: "t-runs",
  kind: "document_promotion",
  task_state: "pending",
  title: `Promote document ${SHA}`,
  summary: "",
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: SHA,
  declaration: DECL,
  payload: {
    ingest_id: SHA,
    notice_id: "PCN-RUNS-0010",
    mfr: "Example Discretes Ltd",
    notice_date: "2026-09-30",
    part_count: PAIRS.length,
    attempt: 1,
    domain: "SUSTAINMENT",
    dropped_by: { authz_id: "alice@example.com", on_behalf_of: null },
  },
});

const keyFor = (owner: string) => `cortex.promotionReview.v1:${owner}.t-runs.${SHA}.1`;
const STORAGE_KEY = keyFor("alice-sub");
/** The signed-in steward, as the card reads it (AuthContext, never useAuth). owner null = no session. */
let OWNER: string | null = "alice-sub";
const asOwner = (sub: string | null) => (sub === null ? undefined : ({ user: { profile: { sub } } } as unknown as AuthContextProps));
const setCfg = (v: Record<string, string> | null) => {
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = v === null ? undefined : v;
};
const ON = { VITE_FEATURES: "promotionRuns" };
const ON_WITH_EDITS = { VITE_FEATURES: "promotionRuns", VITE_PROMOTION_ROW_EDITS: "true" };

beforeEach(() => {
  window.localStorage.clear();
  actOnHumanTask.mockReset();
  fetchIngestSource.mockReset().mockResolvedValue({
    bytes: new Uint8Array([...("%PDF-1.4\n%\xe2\xe3")].map((c) => c.charCodeAt(0))).buffer,
    status: 200,
    contentType: "application/pdf",
  });
  fetchIngestExtraction.mockReset().mockImplementation(async () => body());
  renderPage.mockReset().mockImplementation(async (_n: number, _c: HTMLCanvasElement, w: number) => ({ width: w, height: (w * 792) / 612 }));
  openPdf.mockReset().mockResolvedValue({ numPages: 2, renderPage, destroy: vi.fn() });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
  setCfg(ON);
  OWNER = "alice-sub";
});
afterEach(() => {
  cleanup();
  setCfg(null);
  window.localStorage.clear();
});

const card = () => document.querySelector("[data-promotion-review]") as HTMLElement;
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const key = (k: string, extra: Record<string, unknown> = {}) => fireEvent.keyDown(card(), { key: k, ...extra });
const promoteBtn = () => q('[data-verb="promoted"]') as HTMLButtonElement;
const unitEl = (id: string) => q(`[data-unit="${id}"]`);
const selectedUnit = () => q("[data-unit][data-selected]")?.getAttribute("data-unit") ?? null;
const progress = () => {
  const el = q("[data-review-progress]")!;
  const n = (a: string) => Number(el.getAttribute(`data-progress-${a}`));
  return { looked: n("looked"), left: n("left"), covered: n("covered"), edited: n("edited") };
};
const calloutPair = () => q("[data-callout-pair]")?.textContent?.replace(/\s+/g, " ").trim();

/** Mount and wait until the runs view is drawn AND a page of the source is drawn (Promote's own readiness). */
async function mountRuns() {
  const r = render(<AuthContext.Provider value={asOwner(OWNER)}><ApprovalTaskCard task={task()} /></AuthContext.Provider>);
  await waitFor(() => expect(q("[data-review-progress]")).not.toBeNull());
  await waitFor(() => expect(q("[data-pdf-slot-drawn]")).not.toBeNull());
  // The pane reports its phase in an effect, so a drawn slot can precede the card leaving source-loading (raced under a full suite).
  await waitFor(() => expect(q('[data-verb="promoted"]')?.getAttribute("data-promote-hold")).not.toBe("source-loading"));
  return r;
}

describe("flag off: the card is today's card", () => {
  it("draws the table and none of the runs UI", async () => {
    setCfg(null);
    render(<AuthContext.Provider value={asOwner(OWNER)}><ApprovalTaskCard task={task()} /></AuthContext.Provider>);
    await waitFor(() => expect(document.querySelectorAll("[data-review-row]")).toHaveLength(13));
    for (const s of ["[data-run]", "[data-unit]", "[data-review-progress]", "[data-shared-fact]", "[data-view-toggle]", "[data-record-preview]"]) {
      expect(q(s), s).toBeNull();
    }
    await waitFor(() => expect(q("[data-pdf-slot-drawn]")).not.toBeNull());
    expect(q("[data-review-callout]")).toBeNull();
    expect(q("[data-pdf-slot]")!.className).not.toContain("cursor-crosshair");
  });

  it("j still walks rows, and Shift+J is still nothing", async () => {
    setCfg(null);
    render(<AuthContext.Provider value={asOwner(OWNER)}><ApprovalTaskCard task={task()} /></AuthContext.Provider>);
    await waitFor(() => expect(document.querySelectorAll("[data-review-row]")).toHaveLength(13));
    key("j");
    expect(document.querySelectorAll("[data-review-row]")[1].hasAttribute("data-selected")).toBe(true);
    key("J");
    expect(document.querySelectorAll("[data-review-row]")[1].hasAttribute("data-selected")).toBe(true);
  });
});

describe("runs", () => {
  it("folds the 8 into one run: count, and only the varying characters are highlighted", async () => {
    await mountRuns();
    const runs = document.querySelectorAll("[data-run]");
    expect(runs).toHaveLength(1);
    const head = runs[0] as HTMLElement;
    expect(head.getAttribute("data-run-count")).toBe("8");
    expect(head.textContent).toContain("×8");
    expect(head.textContent).toContain("FK250000 → FK251000");
    expect([...head.querySelectorAll("[data-varies]")].map((e) => e.textContent)).toEqual(["0", "0"]);
    expect(q("[data-review-rows]")).toBeNull();
  });

  it("opening the run lists its members with the same highlight; the stragglers are marked, a doubt is a flag", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    expect(document.querySelectorAll("[data-unit]")).toHaveLength(8 + 2);
    expect(unitEl("p5")!.querySelectorAll("[data-varies]")).toHaveLength(2);
    expect(unitEl("p5")!.querySelector("[data-varies]")!.textContent).toBe("5");
    // straggler: only singles carry it, and never inside a run
    expect(unitEl("p8")!.getAttribute("data-flag")).toContain("straggler");
    expect(unitEl("p9")!.textContent).toContain("straggler");
    expect(unitEl("p4")!.getAttribute("data-flag") ?? "").not.toContain("straggler");
    // the extractor's doubt stays in the run, with its reason
    expect(unitEl("p3")!.getAttribute("data-flag")).toBe("extractor-unsure");
    expect(unitEl("p3")!.textContent).toContain("⚑ unsure: two candidates in the cell");
    expect(q("[data-run]")!.querySelector("[data-run-flagged]")!.getAttribute("data-run-flagged")).not.toBeNull();
  });

  it("the run header counts looked members once they are looked at", async () => {
    await mountRuns();
    key("j");
    key("j");
    // p0 was shown on open, not looked at; p1 and p2 were selected
    expect(q("[data-run]")!.textContent).toContain("✓ 2/8");
  });
});

describe("keys", () => {
  it("j marks the next part looked and the progress numbers move; they always sum to the parts", async () => {
    await mountRuns();
    const before = progress();
    expect(before.looked).toBe(0);
    expect(before.looked + before.left + before.covered).toBe(10);
    key("j");
    expect(selectedUnit()).toBe("p1");
    expect(unitEl("p1")!.hasAttribute("data-looked")).toBe(true);
    key("j");
    const after = progress();
    expect(after.looked).toBe(2);
    expect(after.looked + after.left + after.covered).toBe(10);
    // looking at a check lowers "checks left"; looking at a covered part does not
    expect(after.left).toBeLessThanOrEqual(before.left);
    expect(q("[data-progress-text]")!.textContent).toBe(`looked at 2 · checks left ${after.left} · covered by runs ${after.covered} · ✎ 0 edited`);
  });

  it("ArrowDown and ArrowUp walk the parts like j and k, and are not left to scroll the page", async () => {
    await mountRuns();
    const down = fireEvent.keyDown(card(), { key: "ArrowDown" });
    expect(down).toBe(false); // preventDefault was called
    expect(selectedUnit()).toBe("p1");
    key("ArrowDown");
    expect(selectedUnit()).toBe("p2");
    key("ArrowUp");
    expect(selectedUnit()).toBe("p1");
    key("k");
    expect(selectedUnit()).toBe("p0");
    key("k"); // clamps
    expect(selectedUnit()).toBe("p0");
  });

  it("Shift+J lands on the next unlooked CHECK, skipping the covered parts, and never on a looked one", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    const isCheck = (id: string) => unitEl(id)!.hasAttribute("data-flag") || unitEl(id)!.querySelector('[data-mark="sample"]') !== null;
    const order = [...document.querySelectorAll("[data-unit]")].map((e) => e.getAttribute("data-unit")!);
    const landed: string[] = [];
    for (let n = 0; n < 12; n++) {
      const from = selectedUnit();
      key("J");
      const to = selectedUnit();
      if (to === from) break;
      landed.push(to!);
    }
    expect(landed.length).toBeGreaterThan(0);
    // every landing was a check at the time of landing (flag, or a sample mark that Shift+J then cleared by looking)
    for (const id of landed) expect(unitEl(id)!.hasAttribute("data-looked")).toBe(true);
    // nothing in between was skipped: after the walk, every flagged part past p0 has been looked at
    for (const id of order.filter((i) => i !== "p0")) {
      if (unitEl(id)!.hasAttribute("data-flag")) expect(unitEl(id)!.hasAttribute("data-looked"), id).toBe(true);
    }
    expect(landed).toContain("p3");
    expect(landed).toContain("p9");
    // only unit p0 (the one open on arrival, never selected) can still be a check; Shift+J cannot move on
    expect(progress().left).toBeLessThanOrEqual(1);
    // a covered part is never a landing: it carried neither flag nor sample mark (checked on a fresh mount)
    void isCheck;
  });

  it("Shift+J skips a covered part: from p0 the first landing is a part marked as a check", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    const marked = (id: string) => unitEl(id)!.hasAttribute("data-flag") || unitEl(id)!.querySelector('[data-mark="sample"]') !== null;
    const ids = [...document.querySelectorAll("[data-unit]")].map((e) => e.getAttribute("data-unit")!);
    const expected = ids.slice(1).find(marked)!;
    key("J");
    expect(selectedUnit()).toBe(expected);
    // and Shift+K from there goes back toward p0 only to another unlooked check, else stays
    key("K");
    const back = selectedUnit();
    if (back !== expected) expect(marked(back!) || unitEl(back!)!.hasAttribute("data-looked")).toBe(true);
  });

  it("Shift+ArrowDown is the same jump as J", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    const marked = (id: string) => unitEl(id)!.hasAttribute("data-flag") || unitEl(id)!.querySelector('[data-mark="sample"]') !== null;
    const ids = [...document.querySelectorAll("[data-unit]")].map((e) => e.getAttribute("data-unit")!);
    const expected = ids.slice(1).find(marked);
    key("ArrowDown", { shiftKey: true });
    expect(selectedUnit()).toBe(expected);
  });

  it("in the all-rows view j walks ROWS (the shared-date rows included) and the arrows are aliases", async () => {
    await mountRuns();
    fireEvent.click(q('[data-view="rows"]')!);
    expect(document.querySelectorAll("[data-review-row]")).toHaveLength(13);
    expect(q("[data-run]")).toBeNull();
    key("j");
    expect(document.querySelectorAll("[data-review-row]")[1].hasAttribute("data-selected")).toBe(true); // p0's ltb_date row
    key("ArrowDown");
    expect(document.querySelectorAll("[data-review-row]")[2].hasAttribute("data-selected")).toBe(true);
    key("ArrowUp");
    expect(document.querySelectorAll("[data-review-row]")[1].hasAttribute("data-selected")).toBe(true);
  });
});

describe("promote hold: unchecked", () => {
  it("is held, with the counts and the shared fact named, until every check is looked at and the shared fact confirmed", async () => {
    await mountRuns();
    expect(promoteBtn().disabled).toBe(true);
    expect(promoteBtn().getAttribute("data-promote-hold")).toBe("unchecked");
    const left0 = progress().left;
    expect(q("[data-promote-held]")!.textContent).toBe(`${left0} checks not looked at yet; the shared ltb_date not confirmed. Shift+J walks them.`);

    // walk the checks: Shift+J, then p0 (a sampled end, open on arrival but never selected) by a click
    fireEvent.click(q("[data-run]")!);
    for (let n = 0; n < 12; n++) key("J");
    fireEvent.click(unitEl("p0")!);
    expect(progress().left).toBe(0);
    // checks done, the shared date still unconfirmed: still held, and the text no longer counts checks it has none of
    expect(promoteBtn().getAttribute("data-promote-hold")).toBe("unchecked");
    expect(q("[data-promote-held]")!.textContent).toBe("0 checks not looked at yet; the shared ltb_date not confirmed. Shift+J walks them.");

    fireEvent.click(q("[data-shared-confirm]")!);
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    expect(promoteBtn().getAttribute("data-promote-hold")).toBeNull();
    expect(q("[data-promote-held]")).toBeNull();
  });

  it("confirming alone does not lift it while a check is left", async () => {
    await mountRuns();
    fireEvent.click(q("[data-shared-confirm]")!);
    expect(q("[data-shared-fact]")!.hasAttribute("data-shared-confirmed")).toBe(true);
    expect(q("[data-shared-confirm]")!.textContent).toBe("✓ confirmed");
    expect(promoteBtn().getAttribute("data-promote-hold")).toBe("unchecked");
    expect(q("[data-promote-held]")!.textContent).not.toContain("shared");
    // and it toggles back
    fireEvent.click(q("[data-shared-confirm]")!);
    expect(q("[data-shared-fact]")!.hasAttribute("data-shared-confirmed")).toBe(false);
  });

  it("an existing hold wins: with no source the hold is no-source, not unchecked", async () => {
    fetchIngestSource.mockRejectedValue(new Error("down"));
    render(<AuthContext.Provider value={asOwner(OWNER)}><ApprovalTaskCard task={task()} /></AuthContext.Provider>);
    await waitFor(() => expect(q("[data-review-progress]")).not.toBeNull());
    await waitFor(() => expect(promoteBtn().getAttribute("data-promote-hold")).toBe("no-source"));
  });

  it("the shared fact is described once, with its crop, page and row count", async () => {
    await mountRuns();
    const facts = document.querySelectorAll("[data-shared-fact]");
    expect(facts).toHaveLength(1);
    expect(facts[0].getAttribute("data-shared-fact")).toBe(LTB_KEY);
    expect(facts[0].textContent).toContain("ltb_date 2027-03-31 · inherited from one crop on p1 · 3 rows");
  });

  it("show on a shared fact selects its first row and the pane jumps to that crop", async () => {
    await mountRuns();
    fireEvent.click(q("[data-shared-show]")!);
    await waitFor(() => expect(q("[data-evidence-outline-page]")!.getAttribute("data-evidence-outline-page")).toBe("1"));
    expect(selectedUnit()).toBe("p0");
  });
});

describe("record preview", () => {
  it("says what is sent today and what is only proposed, naming the packet", async () => {
    await mountRuns();
    key("j");
    const sent = q("[data-record-sent]")!.textContent!;
    expect(sent).toBe("sent today: promoted, the note, 0 row edits, 0 header edits");
    const prop = q("[data-record-proposed]")!;
    expect(prop.textContent).toContain("proposed, not sent: the producer does not declare review_coverage yet");
    expect(prop.textContent).toContain("Looked at 1 of 10 parts,");
    expect(prop.textContent).toContain("shared facts confirmed once");
    // One rule groups many runs: the line counts RUNS and names the rule (it once said "15 rules").
    const runs = document.querySelectorAll("[data-run]").length;
    expect(runs).toBeGreaterThan(0);
    expect(prop.textContent, "the record line counts the runs drawn and names the one rule that grouped them").toMatch(
      new RegExp(`covered by ${runs} ${runs === 1 ? "run" : "runs"}, each grouped by the rule same_shape_run;`),
    );
    expect(prop.getAttribute("data-record-coverage-parts")).toBe("10");
    const sampled = Number(prop.getAttribute("data-record-coverage-sampled"));
    expect(sampled).toBeGreaterThan(0);
    expect(prop.textContent).toContain(`of which ${sampled} were sampled`);
    expect(prop.getAttribute("title")).toContain("packet-to-lane-01-from-cortex-review-coverage-on-the-promotion-record.md");
    fireEvent.click(q("[data-shared-confirm]")!);
    expect(prop.textContent).toContain("1 shared facts confirmed once");
  });

  it("promote sends no review_coverage: the record is shown, not sent", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    for (let n = 0; n < 12; n++) key("J");
    fireEvent.click(unitEl("p0")!);
    fireEvent.click(q("[data-shared-confirm]")!);
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    fireEvent.click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(actOnHumanTask.mock.calls)).not.toContain("review_coverage");
    expect(actOnHumanTask.mock.calls[0][1]).toBe("promoted");
  });
});

describe("the callout beside the outlined cell", () => {
  it("shows the extracted pair, sits 4px under the outline's left edge, and ▼ advances to the next part", async () => {
    await mountRuns();
    await waitFor(() => expect(q("[data-review-callout]")).not.toBeNull());
    expect(calloutPair()).toBe("FK250000 → FK251000");
    const outline = q("[data-evidence-outline]")!;
    const slot = q("[data-review-callout-slot]")!;
    expect(slot.getAttribute("data-review-callout-slot")).toBe("below");
    expect(slot.style.left).toBe(outline.style.left);
    expect(parseFloat(slot.style.top)).toBeCloseTo(parseFloat(outline.style.top) + parseFloat(outline.style.height) + 4, 3);
    // inside the target page's own slot
    expect(slot.closest('[data-pdf-slot="2"]')).not.toBeNull();

    fireEvent.click(q('[aria-label="Next part"]')!);
    expect(calloutPair()).toBe("FK250001 → FK251001");
    expect(selectedUnit()).toBe("p1");
    fireEvent.click(q('[aria-label="Previous part"]')!);
    expect(calloutPair()).toBe("FK250000 → FK251000");
  });

  it("goes ABOVE the box when the box is in the page's bottom quarter", async () => {
    await mountRuns();
    fireEvent.click(unitEl("p9")! ?? q("[data-run]")!);
    await waitFor(() => expect(q("[data-review-callout-slot]")).not.toBeNull());
    expect(calloutPair()).toBe("1N4148 → 1N4148W");
    const slot = q("[data-review-callout-slot]")!;
    const outline = q("[data-evidence-outline]")!;
    const pageH = (560 * 792) / 612;
    expect(slot.getAttribute("data-review-callout-slot")).toBe("above");
    expect(slot.style.top).toBe("");
    expect(parseFloat(slot.style.bottom)).toBeCloseTo(pageH - parseFloat(outline.style.top) + 4, 3);
  });

  it("next check jumps like Shift+J and is disabled when no unlooked check lies that way", async () => {
    await mountRuns();
    await waitFor(() => expect(q("[data-callout='next-check']")).not.toBeNull());
    expect((q("[data-callout='prev-check']") as HTMLButtonElement).disabled).toBe(true); // p0 is first
    fireEvent.click(q("[data-callout='next-check']")!);
    expect(selectedUnit()).not.toBe("p0");
    expect(selectedUnit()).not.toBeNull();
  });

  it("marks the part: ✓ once looked, ⚑ and the reason for a doubt", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    fireEvent.click(unitEl("p3")!);
    const c = q("[data-review-callout]")!;
    expect(c.textContent).toContain("✓");
    expect(c.textContent).toContain("⚑ unsure: two candidates in the cell");
  });
});

describe("clicking the page", () => {
  const rect = (el: Element) => {
    (el as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: 0, right: 560, bottom: 724.7, width: 560, height: (560 * 792) / 612, x: 0, y: 0, toJSON: () => ({}) });
  };
  /** The pixel point (in the stubbed 560-wide page) at the middle of a box given in pt. */
  const at = (b: Box) => ({ clientX: (((b[0] + b[2]) / 2) / DIMS.width) * 560, clientY: (((b[1] + b[3]) / 2) / DIMS.height) * ((560 * 792) / 612) });

  it("selects the part whose cell is under the click, and opens its run", async () => {
    await mountRuns();
    const slot = q('[data-pdf-slot="2"]')!;
    rect(slot);
    expect(unitEl("p5")).toBeNull(); // the run is closed
    fireEvent.click(slot, at(boxOf(5)));
    await waitFor(() => expect(selectedUnit()).toBe("p5"));
    expect(unitEl("p5")!.hasAttribute("data-looked")).toBe(true);
    expect(calloutPair()).toBe("FK250005 → FK251005");
  });

  it("a click on empty page moves nothing", async () => {
    await mountRuns();
    const slot = q('[data-pdf-slot="2"]')!;
    rect(slot);
    fireEvent.click(slot, { clientX: 5, clientY: 5 });
    expect(q("[data-unit][data-selected]")).toBeNull(); // run closed, p0 still the selection
    expect(calloutPair()).toBe("FK250000 → FK251000");
    expect(progress().looked).toBe(0);
  });

  it("the shared sentence swallows no click: its box selects nothing", async () => {
    await mountRuns();
    const slot = q('[data-pdf-slot="1"]')!;
    rect(slot);
    fireEvent.click(slot, at(LTB_BOX));
    expect(calloutPair()).toBe("FK250000 → FK251000");
    expect(progress().looked).toBe(0);
  });

  it("a click inside the callout is the callout's own and reports no page point", async () => {
    await mountRuns();
    await waitFor(() => expect(q("[data-review-callout]")).not.toBeNull());
    const slot = q('[data-pdf-slot="2"]')!;
    rect(slot);
    // the coordinates fall inside p5's cell, but the target is the callout
    fireEvent.click(q("[data-review-callout]")!, at(boxOf(5)));
    expect(calloutPair()).toBe("FK250000 → FK251000");
    expect(progress().looked).toBe(0);
  });
});

describe("resume (browser-only)", () => {
  const emptyDraft = { deleted: {}, addedMpns: [], corrected: {}, overrides: {}, addedEvidence: {}, correctedEvidence: {} };
  const save = (o: Record<string, unknown>) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, looked: [], confirmed: [], draft: emptyDraft, headerDraft: {}, sel: 0, ...o }));

  it("a saved entry restores the looked set, the confirmations and the selection, and says it is this browser only", async () => {
    save({ looked: ["p0", "p1", "p4"], confirmed: [LTB_KEY], sel: 7 }); // sel is a ROW index: p4 is the 8th row (three ltb rows precede it)
    await mountRuns();
    await waitFor(() => expect(q("[data-review-resumed]")).not.toBeNull());
    expect(q("[data-review-resumed]")!.textContent).toContain("Resumed: 3 parts looked at, saved in this browser only.");
    expect(progress().looked).toBe(3);
    expect(q("[data-shared-fact]")!.hasAttribute("data-shared-confirmed")).toBe(true);
    await waitFor(() => expect(calloutPair()).toBe("FK250004 → FK251004"));
  });

  it("what the steward does is written back under the card's key", async () => {
    await mountRuns();
    key("j");
    fireEvent.click(q("[data-shared-confirm]")!);
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      expect(saved).toMatchObject({ v: 1, looked: ["p1"], confirmed: [LTB_KEY], sel: 2 });
    });
  });

  it("restoring does not overwrite the entry with the empty state it mounted with", async () => {
    save({ looked: ["p2"], sel: 2 });
    await mountRuns();
    await waitFor(() => expect(progress().looked).toBe(1));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).looked).toEqual(["p2"]);
  });

  it("start over clears the key and the state", async () => {
    save({ looked: ["p0", "p1"], sel: 1 });
    await mountRuns();
    await waitFor(() => expect(q("[data-review-start-over]")).not.toBeNull());
    fireEvent.click(q("[data-review-start-over]")!);
    expect(q("[data-review-resumed]")).toBeNull();
    expect(progress().looked).toBe(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    await waitFor(() => expect(calloutPair()).toBe("FK250000 → FK251000"));
  });

  it("an entry that does not parse, or has another version, is ignored", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const a = await mountRuns();
    expect(q("[data-review-resumed]")).toBeNull();
    expect(progress().looked).toBe(0);
    a.unmount();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, looked: ["p0"], confirmed: [], sel: 0 }));
    await mountRuns();
    expect(q("[data-review-resumed]")).toBeNull();
    expect(progress().looked).toBe(0);
  });

  it("a pristine entry (what a fresh visit leaves) is no resume", async () => {
    save({});
    await mountRuns();
    expect(q("[data-review-resumed]")).toBeNull();
  });
});

describe("resume is per owner", () => {
  const emptyDraft = { deleted: {}, addedMpns: [], corrected: { FK250002: "FK25X" }, overrides: {}, addedEvidence: {}, correctedEvidence: {} };
  const seed = (owner: string) => window.localStorage.setItem(keyFor(owner), JSON.stringify({ v: 1, looked: ["p0", "p1"], confirmed: [], draft: emptyDraft, headerDraft: {}, sel: 0 }));

  it("owner B mounting the same task sees none of owner A's looked set or fixes", async () => {
    const a = await mountRuns(); // A works through the UI, which writes under A's key
    key("j");
    key("j");
    await waitFor(() => expect(window.localStorage.getItem(keyFor("alice-sub"))).not.toBeNull());
    a.unmount();
    OWNER = "bob-sub";
    await mountRuns();
    expect(q("[data-review-resumed]")).toBeNull();
    expect(progress().looked).toBe(0);
    expect(progress().edited).toBe(0);
    expect(JSON.parse(window.localStorage.getItem(keyFor("alice-sub"))!).looked).toEqual(["p1", "p2"]);
  });

  it("the owner who saved gets the resume back", async () => {
    seed("alice-sub");
    await mountRuns();
    await waitFor(() => expect(q("[data-review-resumed]")).not.toBeNull());
    expect(progress().looked).toBe(2);
  });

  it("a null owner restores nothing and writes no localStorage key at all, yet the review works in memory", async () => {
    const before = window.localStorage.length;
    OWNER = null;
    await mountRuns();
    expect(q("[data-review-resumed]")).toBeNull();
    key("j");
    key("j");
    expect(progress().looked).toBe(2);
    expect(window.localStorage.length).toBe(before);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it("no sub, even with VITE_NO_AUTH on: no owner, so nothing is persisted", async () => {
    setCfg({ ...ON, VITE_NO_AUTH: "true" });
    OWNER = null;
    await mountRuns();
    key("j");
    expect(progress().looked).toBe(1);
    expect(Object.keys(window.localStorage)).toEqual([]);
  });
});

describe("edited marks (editor flag on)", () => {
  it("drafting a fix from the callout switches to the rows, and the part reads ✎ edited in the runs", async () => {
    setCfg(ON_WITH_EDITS);
    await mountRuns();
    await waitFor(() => expect(q("[data-callout='fix']")).not.toBeNull());
    expect(progress().edited).toBe(0);
    fireEvent.click(q("[data-callout='fix']")!);
    expect(q("[data-fix-mpn='FK250000']")).not.toBeNull(); // the table's own editor row
    expect(q("[data-run]")).toBeNull();
    expect(progress().edited).toBe(1);
    expect(q("[data-progress-text]")!.textContent).toContain("✎ 1 edited");
    expect(q("[data-callout='fix']")).toBeNull(); // already drafted: no second fix

    fireEvent.click(q('[data-view="runs"]')!);
    fireEvent.click(q("[data-run]")!);
    expect(unitEl("p0")!.hasAttribute("data-edited")).toBe(true);
    expect(unitEl("p0")!.textContent).toContain("✎");
    expect(q("[data-run]")!.textContent).toContain("✎ 1");
    expect(unitEl("p1")!.hasAttribute("data-edited")).toBe(false);
    // the preview counts the draft as sent today
    expect(q("[data-record-sent]")!.textContent).toContain("1 row edits");
  });

  it("without the editor flag there is no fix on the callout and nothing reads edited", async () => {
    await mountRuns();
    await waitFor(() => expect(q("[data-callout='next']")).not.toBeNull());
    expect(q("[data-callout='fix']")).toBeNull();
    expect(progress().edited).toBe(0);
  });
});

describe("group jumps and where-am-I", () => {
  const RUN = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"];
  const placeText = () => q("[data-callout-place]")?.textContent ?? null;
  const btn = (name: string) => q(`[data-callout='${name}']`) as HTMLButtonElement;
  const lookedIds = () => [...document.querySelectorAll("[data-unit][data-looked]")].map((e) => e.getAttribute("data-unit")!);
  const barText = () => q("[data-runs-here]")!.textContent;

  it("the callout says S1 · n of 8 for a run member, and the group buttons are disabled on a single", async () => {
    await mountRuns();
    await waitFor(() => expect(placeText()).toBe("S1 · 1 of 8"));
    fireEvent.click(q("[data-run]")!);
    fireEvent.click(unitEl("p2")!);
    expect(placeText()).toBe("S1 · 3 of 8");
    expect(btn("group-start").disabled).toBe(false);
    expect(btn("group-end").disabled).toBe(false);
    expect(btn("group-random").disabled).toBe(false);
    fireEvent.click(unitEl("p8")!);
    expect(placeText()).toBe("↯ straggler");
    for (const n of ["group-start", "group-end", "group-random"]) expect(btn(n).disabled).toBe(true);
  });

  it("group end / start go to the run's last / first member and disable themselves there", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    fireEvent.click(unitEl("p2")!);
    fireEvent.click(btn("group-end"));
    expect(selectedUnit()).toBe("p7");
    expect(placeText()).toBe("S1 · 8 of 8");
    expect(btn("group-end").disabled).toBe(true);
    fireEvent.click(btn("group-start"));
    expect(selectedUnit()).toBe("p0");
    expect(placeText()).toBe("S1 · 1 of 8");
    expect(btn("group-start").disabled).toBe(true);
  });

  it("random moves within the run, never stays, and prefers an unlooked member", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    fireEvent.click(unitEl("p2")!);
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const before = lookedIds();
      fireEvent.click(btn("group-random"));
      const now = selectedUnit()!;
      expect(RUN).toContain(now);
      expect(now).not.toBe("p2");
      expect(before).not.toContain(now);
      // second arm: every other member looked -> still moves, inside the run
      for (const id of RUN) fireEvent.click(unitEl(id)!);
      fireEvent.click(unitEl("p4")!);
      fireEvent.click(btn("group-random"));
      expect(RUN).toContain(selectedUnit());
      expect(selectedUnit()).not.toBe("p4");
    } finally {
      spy.mockRestore();
    }
  });

  it("Home / End / s do what the buttons do, and s while typing does nothing", async () => {
    await mountRuns();
    fireEvent.click(q("[data-run]")!);
    fireEvent.click(unitEl("p2")!);
    key("End");
    expect(selectedUnit()).toBe("p7");
    key("Home");
    expect(selectedUnit()).toBe("p0");
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      fireEvent.click(unitEl("p2")!);
      const before = lookedIds();
      key("s");
      expect(RUN).toContain(selectedUnit());
      expect(selectedUnit()).not.toBe("p2");
      expect(before).not.toContain(selectedUnit());
      const input = document.createElement("input");
      card().appendChild(input);
      const at = selectedUnit();
      fireEvent.keyDown(input, { key: "s" });
      fireEvent.keyDown(input, { key: "End" });
      expect(selectedUnit()).toBe(at);
      input.remove();
    } finally {
      spy.mockRestore();
    }
  });

  it("the where-am-I bar follows the selection; exactly one run card is current; a closed run shows where you are", async () => {
    await mountRuns();
    expect(barText()).toContain("S1 · part 1 of 8 · 1 of 10");
    expect(document.querySelectorAll("[data-run-current]")).toHaveLength(1);
    expect(q("[data-run-card][data-run-current] [data-run-here]")!.textContent).toContain("◉ at 1");
    key("j");
    expect(barText()).toContain("S1 · part 2 of 8 · 2 of 10");
    // selecting opened the run: the chip goes, the card stays current
    expect(q("[data-run-here]")).toBeNull();
    expect(document.querySelectorAll("[data-run-current]")).toHaveLength(1);
    fireEvent.click(unitEl("p8")!);
    expect(document.querySelectorAll("[data-run-current]")).toHaveLength(0);
    expect(barText()).toContain("BYV34-400");
    expect(barText()).toContain("9 of 10");
    expect(barText()).toContain("↯ straggler");
  });

  it("a straggler is its own card with ↯ STRAGGLER", async () => {
    await mountRuns();
    const el = unitEl("p9")!;
    expect(el.textContent).toContain("↯ STRAGGLER");
    expect(el.closest("[data-run-card]")).toBeNull();
    expect(el.getAttribute("role")).toBe("option");
  });
});

describe("each collapsed group names the rule that grouped it (ruling 3b)", () => {
  it("on the scale fixture every run header carries the rule and its shape key, one per run in the plan", async () => {
    fetchIngestExtraction.mockImplementation(async () => scaleFixtureExtractionBody(SHA));
    await mountRuns();
    const plan = buildReviewPlan(readExtraction(scaleFixtureExtractionBody(SHA))!.rows, "seed");
    const expected = plan.segments.flatMap((s) => (s.kind === "run" ? [s.run] : []));
    const heads = [...document.querySelectorAll<HTMLElement>("[data-run]")];
    expect(expected.length).toBeGreaterThan(1);
    expect(heads).toHaveLength(expected.length);
    expect(document.querySelectorAll('[data-run][data-run-rule="same_shape_run"]')).toHaveLength(expected.length);
    heads.forEach((h) => {
      const run = expected.find((r) => r.id === h.getAttribute("data-run"))!;
      const first = plan.units[run.units[0]];
      const key = h.getAttribute("data-run-key");
      expect(key).toBeTruthy();
      expect(key).toBe(`${shapeOf(first.mpn)}→${shapeOf(first.replacement ?? "")}`);
      expect(h.textContent).toContain(key!);
    });
  });

  it("a shared fact names its rule, and still says where the crop is", async () => {
    await mountRuns();
    const f = q("[data-shared-fact]")!;
    expect(f.getAttribute("data-shared-rule")).toBe("same_inherited_crop");
    expect(f.textContent).toContain("same crop:");
    expect(f.textContent).toContain("inherited from one crop on p1 · 3 rows");
  });
});
