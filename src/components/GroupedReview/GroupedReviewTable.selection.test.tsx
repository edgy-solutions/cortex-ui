/**
 * Grouped disposition review: whole-row selection, the in-card source pane, the shared page
 * navigator, keyboard, and the top line.
 *
 * The wire has NO per-row evidence_ref and no page on ReviewItem. The per-row identity is the MPN,
 * and a row's evidence is the notice-provenance item whose `mpn` equals it; its page is that
 * item's `page_number`. Rows M1-M4 sit on page 1, M5 on page 3, M6 and M7 on page 4.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { fetchProv } = vi.hoisted(() => ({ fetchProv: vi.fn() }));
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<typeof import("@/api/client")>()),
  fetchNoticeProvenance: (...a: unknown[]) => fetchProv(...a),
}));
vi.mock("../mesh/FederatedImage", () => ({
  FederatedImage: ({ src, alt }: { src: string; alt: string }) => <img data-provenance-img src={src} alt={alt} />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { GroupedReviewTable } from "./GroupedReviewTable";
import type { ReviewBatch } from "./types";

const PAGES: Record<string, number> = { M1: 1, M2: 1, M3: 1, M4: 1, M5: 3, M6: 4, M7: 4 };
const NOTICE = "PCN-SEL-1";
let seq = 0;
function batch(): ReviewBatch {
  return {
    batch_id: `sel-task-${++seq}`,
    notice_id: NOTICE,
    notice_type: "PCN",
    notice_fingerprint: "fp",
    approver: "me",
    items: Object.keys(PAGES).map((mpn) => ({ mpn, proposed_disposition: "archive", needs_review: false })),
  };
}
const provResp = () => ({
  notice_id: NOTICE,
  page_image_url: "/p.png",
  source: "test",
  items: Object.entries(PAGES).map(([mpn, page_number]) => ({
    field_path: `rows.${mpn}`,
    mpn,
    value: mpn,
    source_snippet: mpn,
    page_number,
    bboxes: [[10, 10, 50, 20]],
    page_dims: { width: 612, height: 792 },
    region: "table",
    match_method: "unique",
    match_confidence: 1,
    needs_review: false,
    review_reason: null,
    page_image_url: `/page-${page_number}.png`,
  })),
});

beforeEach(() => {
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = { VITE_REVIEW_ROW_EDITS: "true" };
  fetchProv.mockReset();
  fetchProv.mockResolvedValue(provResp());
});
afterEach(() => {
  cleanup();
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = undefined;
});

const row = (c: HTMLElement, mpn: string) => c.querySelector(`[data-review-row="${mpn}"]`) as HTMLElement;
const selectedMpns = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-review-row][aria-selected="true"]')).map((r) => r.getAttribute("data-review-row"));
const pane = (c: HTMLElement) => c.querySelector("[data-provenance-pane]") as HTMLElement | null;
const paneAttr = (c: HTMLElement, a: string) => pane(c)?.getAttribute(a);
const list = (c: HTMLElement) => c.querySelector("tbody[tabindex]") as HTMLElement;
// a plain text cell: the MPN label, not a button
const cell = (c: HTMLElement, mpn: string) => row(c, mpn).querySelector("td span") as HTMLElement;
const nextBtn = (c: HTMLElement) => c.querySelector("[data-pagenav-next]") as HTMLElement;

async function ready() {
  const r = render(<GroupedReviewTable batch={batch()} />);
  await waitFor(() => expect(paneAttr(r.container, "data-provenance-page"), "pane loaded on row 1's page").toBe("1"));
  return r.container;
}
async function selectM5(c: HTMLElement) {
  fireEvent.click(cell(c, "M5"));
  await waitFor(() => expect(paneAttr(c, "data-provenance-page"), "page followed the selection to 3").toBe("3"));
}

describe("whole-row selection", () => {
  it("on mount the first active row is selected", async () => {
    const c = await ready();
    expect(selectedMpns(c), "only row 1 selected on mount").toEqual(["M1"]);
    expect(row(c, "M1").hasAttribute("data-selected"), "data-selected on row 1").toBe(true);
  });

  it("A: a click on a plain cell selects that row and the pane shows its evidence", async () => {
    const c = await ready();
    await selectM5(c);
    expect(selectedMpns(c), "row 5 is the only selected row").toEqual(["M5"]);
    expect(paneAttr(c, "data-provenance-mpn"), "pane shows row 5's mpn").toBe("M5");
    expect(paneAttr(c, "data-provenance-page"), "pane shows row 5's page").toBe("3");
    expect(paneAttr(c, "data-provenance-item-page"), "row 5's item is on page 3").toBe("3");
    expect(fetchProv, "fetched for the batch's notice").toHaveBeenCalledWith(NOTICE);
  });

  it("B: the navigator moves the page and leaves the selection alone", async () => {
    const c = await ready();
    await selectM5(c);
    fireEvent.click(nextBtn(c));
    await waitFor(() => expect(paneAttr(c, "data-provenance-page"), "next evidence page after 3 is 4").toBe("4"));
    expect(selectedMpns(c), "row 5 is STILL the only selected row after paging").toEqual(["M5"]);
    expect(paneAttr(c, "data-provenance-mpn"), "pane still names row 5").toBe("M5");
    expect(paneAttr(c, "data-provenance-item-page"), "row 5's item page is unchanged").toBe("3");
  });

  it("C: ArrowDown selects row 6 and the page snaps to row 6's page; ArrowUp snaps back", async () => {
    const c = await ready();
    await selectM5(c);
    fireEvent.click(nextBtn(c));
    await waitFor(() => expect(paneAttr(c, "data-provenance-page")).toBe("4"));
    fireEvent.keyDown(list(c), { key: "ArrowDown" });
    await waitFor(() => expect(selectedMpns(c), "row 6 selected by ArrowDown").toEqual(["M6"]));
    expect(paneAttr(c, "data-provenance-page"), "page follows row 6").toBe("4");
    fireEvent.keyDown(list(c), { key: "ArrowUp" });
    await waitFor(() => expect(selectedMpns(c), "row 5 selected by ArrowUp").toEqual(["M5"]));
    expect(paneAttr(c, "data-provenance-page"), "page snapped back to row 5's page").toBe("3");
  });

  it("D: ArrowUp from row 1 stays on row 1; arrows typed in an edit input do not move selection", async () => {
    const c = await ready();
    fireEvent.keyDown(list(c), { key: "ArrowUp" });
    expect(selectedMpns(c), "clamped at the top").toEqual(["M1"]);
    await selectM5(c);
    fireEvent.click(row(c, "M2").querySelector("[data-review-row-edit]")!);
    const input = c.querySelector("[data-review-row-edit-input]") as HTMLElement;
    expect(input, "edit input is open").not.toBeNull();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(selectedMpns(c), "ArrowUp in the input leaves selection on row 5").toEqual(["M5"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(selectedMpns(c), "ArrowDown in the input leaves selection on row 5").toEqual(["M5"]);
  });

  it("E: the edit and delete buttons do not change selection", async () => {
    const c = await ready();
    await selectM5(c);
    fireEvent.click(row(c, "M2").querySelector("[data-review-row-edit]")!);
    expect(selectedMpns(c), "edit button click leaves row 5 selected").toEqual(["M5"]);
    fireEvent.click(row(c, "M4").querySelector("[data-review-row-delete]")!);
    expect(selectedMpns(c), "delete button click leaves row 5 selected").toEqual(["M5"]);
  });

  it("F: the per-row page icon is gone, edit and delete stay", async () => {
    const c = await ready();
    expect(c.querySelector('[title="Show where this came from in the notice"]'), "old page-icon title absent").toBeNull();
    expect(c.querySelector("svg.lucide-file-search"), "no FileSearch glyph").toBeNull();
    expect(c.querySelectorAll("[data-review-row-edit]").length, "edit icon per row").toBe(7);
    expect(c.querySelectorAll("[data-review-row-delete]").length, "delete icon per row").toBe(7);
  });

  it("G: a deleted row cannot be selected by click or keyboard", async () => {
    const c = await ready();
    fireEvent.click(cell(c, "M2"));
    fireEvent.click(row(c, "M3").querySelector("[data-review-row-delete]")!);
    const dead = c.querySelector('[data-review-row-deleted="M3"]') as HTMLElement;
    expect(dead, "row 3 is deleted").not.toBeNull();
    expect(dead.hasAttribute("aria-selected"), "deleted row carries no selection state").toBe(false);
    fireEvent.click(dead.querySelector("td")!);
    expect(selectedMpns(c), "click on the deleted row selects nothing new").toEqual(["M2"]);
    fireEvent.keyDown(list(c), { key: "ArrowDown" });
    await waitFor(() => expect(selectedMpns(c), "ArrowDown skips the deleted row 3").toEqual(["M4"]));
  });

  it("H: the top line names the notice and the stage", async () => {
    const c = await ready();
    const top = c.querySelector("[data-review-topline]")!;
    expect(top.textContent, "notice id").toContain(NOTICE);
    expect(top.textContent, "stage word").toContain("disposition review");
    expect(top.querySelector('[data-topline="notice"]'), "notice span").not.toBeNull();
    expect(top.querySelector('[data-topline="stage"]'), "stage span").not.toBeNull();
  });

  it("I: provenance is fetched once across selection and paging", async () => {
    const c = await ready();
    await selectM5(c);
    fireEvent.click(nextBtn(c));
    fireEvent.keyDown(list(c), { key: "ArrowDown" });
    await waitFor(() => expect(selectedMpns(c)).toEqual(["M6"]));
    expect(fetchProv, "no refetch on selection or page change").toHaveBeenCalledTimes(1);
  });
});
