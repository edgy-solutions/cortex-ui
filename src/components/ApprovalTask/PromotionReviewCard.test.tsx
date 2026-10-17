/**
 * The promotion review card against the review standard (overnight directive 2026-10-17):
 *   - the top line;
 *   - the rows;
 *   - the source at the selected row's evidence, with the box outlined;
 *   - the decision, by mouse and by keyboard.
 *
 * Its data is Lane 1's 193 shape: the payload header, plus `GET /ingest/{id}/extraction` and
 * `/source` through `@/lib/ingestTransport`, which is stood in for here.
 *
 * pdf.js is stood in for too (`@/lib/pdfSource`). jsdom has no canvas, and what is sealed here is
 * WHICH page is drawn and WHERE the outline lands, given the size the page was drawn at. That the
 * fixture's boxes sit on their text, in `pt` and in `px` alike, is sealed separately with the real
 * pdf.js, in `src/lib/promotionReviewFixture.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({ actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
const fetchIngestSource = vi.fn();
const fetchIngestExtraction = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestSource: (...a: unknown[]) => fetchIngestSource(...a),
  fetchIngestExtraction: (...a: unknown[]) => fetchIngestExtraction(...a),
}));
const renderPage = vi.fn();
const destroy = vi.fn();
const openPdf = vi.fn();
vi.mock("@/lib/pdfSource", () => ({
  openPdf: (...a: unknown[]) => openPdf(...a),
  RenderCancelled: class extends Error {},
}));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { fixtureExtractionBody, fixturePromotionPayload, FIXTURE_NOTICE_ID } from "@/lib/promotionReviewFixture";
import { useTaskKindStore } from "@/store/useTaskKindStore";

const SHA = `sha256:${"5b15f205".padEnd(64, "a")}`;
const DECL = {
  kind: "document_promotion",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "PROMOTE",
  title: "Contributed document",
  accepts: ["promoted", "rejected"],
  reason_required: ["rejected"],
};
type Row = Record<string, unknown> & { evidence_ref: { page: number; bbox: number[]; page_dims: { width: number; height: number } } | null };
type Body = Record<string, unknown> & { rows: Row[] };
const exBody = (): Body => fixtureExtractionBody(SHA) as unknown as Body;
/** The 193 payload. The task's TITLE is left the pre-193 sha, to show the card never draws it. */
const payload193 = (over: Record<string, unknown> = {}) => ({
  ...fixturePromotionPayload(SHA),
  domain: "SUSTAINMENT",
  dropped_by: { authz_id: "alice@example.com", on_behalf_of: null },
  ...over,
});
const task = (over: Partial<ApprovalTaskPayload> = {}): ApprovalTaskPayload => ({
  task_id: "t-promo",
  kind: "document_promotion",
  task_state: "pending",
  title: `Promote document ${SHA}`,
  summary: `Review the extracted document ${SHA} for promotion.`,
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: SHA,
  declaration: DECL,
  payload: payload193(),
  ...over,
});

// jsdom measures every element 0 wide, so the pane draws at its default width.
const W = 560;

beforeEach(() => {
  actOnHumanTask.mockReset();
  fetchIngestSource.mockReset().mockResolvedValue(new ArrayBuffer(8));
  fetchIngestExtraction.mockReset().mockImplementation(async () => exBody());
  renderPage.mockReset().mockImplementation(async (_n: number, _c: HTMLCanvasElement, w: number) => ({ width: w, height: (w * 792) / 612 }));
  destroy.mockReset();
  openPdf.mockReset().mockResolvedValue({ numPages: 2, renderPage, destroy });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});
afterEach(cleanup);

const card = () => document.querySelector("[data-promotion-review]") as HTMLElement;
const rowEls = () => [...document.querySelectorAll("[data-review-row]")] as HTMLElement[];
const selectedKey = () => document.querySelector("[data-review-row][data-selected]")?.getAttribute("data-review-row");
const outline = () => document.querySelector("[data-evidence-outline]") as HTMLElement | null;
const flag = (k: string) => document.querySelector(`[data-review-flag="${k}"]`);
const key = (k: string, target: Element = card()) => fireEvent.keyDown(target, { key: k });
const lastPage = () => renderPage.mock.calls.at(-1)?.[0];
const topline = (k: string) => document.querySelector(`[data-topline="${k}"]`)?.textContent?.replace(/^ · /, "");

/** Render, and wait until the extraction's rows are drawn. */
async function mount(t: ApprovalTaskPayload = task(), rows = 6) {
  const r = render(<ApprovalTaskCard task={t} />);
  await waitFor(() => expect(rowEls()).toHaveLength(rows));
  return r;
}

/** The outline's CSS box, and what the row's evidence_ref scales to at the drawn size. */
function expectOutlineOn(rowIndex: number, body: Body = exBody()) {
  const ref = body.rows[rowIndex].evidence_ref!;
  const el = outline();
  expect(el, `outline for row ${rowIndex}`).not.toBeNull();
  expect(el!.getAttribute("data-evidence-outline-page")).toBe(String(ref.page));
  const [x0, y0, x1, y1] = ref.bbox;
  // Scaled by the row's OWN page_dims, so a px row and a pt row land alike on a 612pt-wide page.
  const sx = W / ref.page_dims.width;
  const sy = (W * 792) / 612 / ref.page_dims.height;
  expect(parseFloat(el!.style.left)).toBeCloseTo(x0 * sx, 3);
  expect(parseFloat(el!.style.top)).toBeCloseTo(y0 * sy, 3);
  expect(parseFloat(el!.style.width)).toBeCloseTo((x1 - x0) * sx, 3);
  expect(parseFloat(el!.style.height)).toBeCloseTo((y1 - y0) * sy, 3);
}

describe("which card draws", () => {
  it("a document_promotion task naming an ingest_id draws the review card, and fetches both routes by that id", async () => {
    await mount();
    expect(card()).not.toBeNull();
    expect(fetchIngestExtraction).toHaveBeenCalledWith(SHA);
    expect(fetchIngestSource).toHaveBeenCalledWith(SHA);
    await waitFor(() => expect(outline()).not.toBeNull());
  });

  it("one without an ingest_id draws the generic card, unchanged, and fetches nothing", () => {
    render(<ApprovalTaskCard task={task({ payload: { domain: "SUSTAINMENT" } })} />);
    expect(card()).toBeNull();
    expect(screen.getByText(`Promote document ${SHA}`)).toBeTruthy();
    expect(fetchIngestExtraction).not.toHaveBeenCalled();
    expect(fetchIngestSource).not.toHaveBeenCalled();
  });

  it("another kind carrying an ingest_id draws the generic card", () => {
    render(<ApprovalTaskCard task={task({ kind: "evidence_review", declaration: { ...DECL, kind: "evidence_review" } })} />);
    expect(card()).toBeNull();
    expect(fetchIngestExtraction).not.toHaveBeenCalled();
  });
});

describe("the top line", () => {
  it("the title is the notice id, never the sha; the sha is in the provenance line", async () => {
    await mount();
    const title = document.querySelector("[data-review-title]")!;
    expect(title.textContent).toBe(FIXTURE_NOTICE_ID);
    expect(title.textContent).not.toContain("5b15f205");
    expect(document.querySelector("[data-review-provenance]")!.textContent).toContain(SHA);
  });

  it("names kind, manufacturer, notice date, N parts, attempt, dropped_by and the sha prefix", async () => {
    await mount();
    expect(topline("kind")).toBe("kind ?"); // PCN/PDN is served by neither source
    expect(topline("manufacturer")).toBe("Example Discretes Ltd");
    expect(topline("notice-date")).toBe("2026-09-30");
    expect(topline("parts")).toBe("2 parts");
    expect(topline("attempt")).toBe("attempt 1");
    expect(topline("dropped-by")).toBe("dropped by alice@example.com");
    expect(topline("sha")).toBe("5b15f205aaaa");
    expect(document.querySelector(`[data-topline="sha"]`)!.getAttribute("title")).toBe(SHA);
  });

  it("a 193 task's title is there before the extraction arrives", () => {
    fetchIngestExtraction.mockReturnValue(new Promise(() => {}));
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-review-title]")!.textContent).toBe(FIXTURE_NOTICE_ID);
    expect(document.querySelector('[data-extraction-state="loading"]')).not.toBeNull();
  });

  it("a pre-193 task (payload: ingest_id and notice_id only) takes the rest of its top line from the extraction", async () => {
    await mount(task({ payload: { ingest_id: SHA, notice_id: FIXTURE_NOTICE_ID, dropped_by: { authz_id: "alice@example.com" } } }));
    expect(topline("manufacturer")).toBe("Example Discretes Ltd");
    expect(topline("notice-date")).toBe("2026-09-30");
    expect(topline("parts")).toBe("2 parts");
    expect(topline("attempt")).toBe("attempt 1");
    expect(flag("header-conflict")).toBeNull();
  });

  it("a payload with no notice id at all is titled from the extraction once it arrives, and is neutral until then", async () => {
    let answer!: (b: unknown) => void;
    fetchIngestExtraction.mockReturnValue(new Promise((r) => (answer = r)));
    render(<ApprovalTaskCard task={task({ payload: { ingest_id: SHA } })} />);
    expect(document.querySelector("[data-review-title]")!.textContent).toBe("Document promotion");
    expect(flag("no-notice-id")).toBeNull(); // not a miss yet: the extraction may carry it
    answer(exBody());
    await waitFor(() => expect(document.querySelector("[data-review-title]")!.textContent).toBe(FIXTURE_NOTICE_ID));
  });

  it("no notice id from either source: a neutral title, still not the sha, and a flag saying why", async () => {
    const b = exBody();
    delete b.notice_id;
    fetchIngestExtraction.mockResolvedValue(b);
    await mount(task({ payload: payload193({ notice_id: null }) }));
    expect(document.querySelector("[data-review-title]")!.textContent).toBe("Document promotion");
    expect(flag("no-notice-id")).not.toBeNull();
  });

  it("the payload and the extraction disagreeing is flagged by field, and the payload's value is drawn", async () => {
    await mount(task({ payload: payload193({ notice_id: "EOL-37", attempt: 2 }) }));
    expect(document.querySelector("[data-review-title]")!.textContent).toBe("EOL-37");
    expect(topline("attempt")).toBe("attempt 2");
    expect(flag("header-conflict")!.textContent).toContain("notice id, attempt");
  });

  it("the kind is muted text, not a bordered chip (bordered means clickable)", async () => {
    await mount();
    const kind = document.querySelector('[data-topline="kind"]')!;
    expect(kind.closest("button")).toBeNull();
    expect(kind.className).not.toMatch(/\bborder\b/);
  });
});

describe("rows and the source", () => {
  it("draws every row with mpn, change, value and via", async () => {
    await mount();
    const first = within(rowEls()[0]);
    expect(first.getByText("BYV34-400")).toBeTruthy();
    expect(first.getByText("ltb_date")).toBeTruthy();
    expect(first.getByText("2027-03-31")).toBeTruthy();
    expect(first.getByText("text_layer_cell")).toBeTruthy();
  });

  it("on open: the first row is selected, its page drawn, its box outlined", async () => {
    await mount();
    expect(selectedKey()).toBe("row-0");
    await waitFor(() => expect(outline()).not.toBeNull());
    expect(lastPage()).toBe(1);
    expectOutlineOn(0);
    expect(document.querySelector("[data-pdf-page]")!.getAttribute("data-pdf-page")).toBe("1");
  });

  it("show on a row on page 2 (measured in px) jumps the PDF there and outlines that row", async () => {
    await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    fireEvent.click(document.querySelector('[data-show-row="row-5"]')!);
    expect(selectedKey()).toBe("row-5");
    await waitFor(() => expect(outline()?.getAttribute("data-evidence-outline-page")).toBe("2"));
    expect(lastPage()).toBe(2);
    expectOutlineOn(5);
  });

  it("clicking the row itself selects it too", async () => {
    await mount();
    fireEvent.click(rowEls()[2]);
    expect(selectedKey()).toBe("row-2");
    await waitFor(() => expectOutlineOn(2));
  });

  it("no outline is drawn over a page that has not finished drawing", async () => {
    let finish!: () => void;
    await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    renderPage.mockImplementationOnce(
      (_n: number, _c: HTMLCanvasElement, w: number) => new Promise((r) => (finish = () => r({ width: w, height: (w * 792) / 612 }))),
    );
    fireEvent.click(document.querySelector('[data-show-row="row-4"]')!);
    await waitFor(() => expect(lastPage()).toBe(2));
    expect(outline()).toBeNull(); // row 4's box is NOT drawn on page 1's canvas
    finish();
    await waitFor(() => expectOutlineOn(4));
  });

  it("a row with no evidence_ref says so instead of a show button, and the card flags the miss", async () => {
    const b = exBody();
    b.rows[1].evidence_ref = null;
    b.rows_without_evidence = 1;
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    expect(document.querySelector('[data-show-row="row-1"]')).toBeNull();
    expect(within(rowEls()[1]).getByText("no evidence")).toBeTruthy();
    expect(flag("absent-evidence")!.textContent).toContain("1 row");
    expect(flag("evidence-count-mismatch")).toBeNull();
    fireEvent.click(rowEls()[1]);
    await waitFor(() => expect(lastPage()).toBe(1));
    expect(outline()).toBeNull();
  });

  it("rows_without_evidence that disagrees with the rows drawn is flagged", async () => {
    fetchIngestExtraction.mockResolvedValue({ ...exBody(), rows_without_evidence: 2 });
    await mount();
    expect(flag("evidence-count-mismatch")!.textContent).toMatch(/counts 2\s*rows without evidence; 0 drawn/);
  });

  it("the extractor's own doubt is drawn beside the value", async () => {
    const b = exBody();
    Object.assign(b.rows[3], { needs_review: true, review_reason: "two ship dates on the page" });
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    expect(within(rowEls()[3]).getByText("extractor unsure: two ship dates on the page")).toBeTruthy();
    expect(rowEls()[0].querySelector("[data-needs-review]")).toBeNull();
  });

  it("part_count that disagrees with the rows is flagged with both numbers", async () => {
    await mount(task({ payload: payload193({ part_count: 3 }) }));
    expect(flag("parts-mismatch")!.textContent).toBe("The notice declares 3 parts; the rows name 2.");
  });

  it("evidence naming a page past the end is flagged, and draws page 1 with no outline", async () => {
    const b = exBody();
    b.rows[0].evidence_ref!.page = 9;
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    await waitFor(() => expect(document.querySelector("[data-evidence-page-out-of-range]")).not.toBeNull());
    await waitFor(() => expect(lastPage()).toBe(1));
    expect(outline()).toBeNull();
  });

  it("a source the server will not serve names its code, and the rows still draw", async () => {
    // As axios delivers it: /source is fetched as an arraybuffer, so the error body is bytes too.
    const body = new TextEncoder().encode(JSON.stringify({ detail: { error: "source_absent" } })).buffer;
    fetchIngestSource.mockRejectedValue({ response: { status: 404, data: body } });
    await mount();
    await waitFor(() => expect(document.querySelector("[data-pdf-failed]")).not.toBeNull());
    expect(document.querySelector("[data-pdf-failed]")!.textContent).toContain("404 source_absent");
    expect(document.querySelector('[data-pdf-state="failed"]')).not.toBeNull();
  });

  it("an extraction route not served yet (a plain 404, before 193) says so; the source and the decision remain", async () => {
    fetchIngestExtraction.mockRejectedValue({ response: { status: 404, data: { detail: "Not Found" } } });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")).not.toBeNull());
    expect(document.querySelector("[data-extraction-failed]")!.textContent).toContain("not served here yet (404)");
    expect(rowEls()).toHaveLength(0);
    expect(document.querySelector("[data-review-title]")!.textContent).toBe(FIXTURE_NOTICE_ID); // the payload's
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(document.querySelector('[data-verb="promoted"]')).not.toBeNull();
  });

  it("an extraction refused with a code names it (403 not_entitled)", async () => {
    fetchIngestExtraction.mockRejectedValue({ response: { status: 403, data: { detail: { error: "not_entitled" } } } });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")?.textContent).toContain("403 not_entitled"));
  });

  it("an extraction with no rows array is a failure, not an empty table", async () => {
    fetchIngestExtraction.mockResolvedValue({ ingest_id: SHA, notice_id: "x" });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")).not.toBeNull());
    expect(document.querySelector('[data-extraction-state="empty"]')).toBeNull();
  });

  it("an extraction with an empty rows array says it has none", async () => {
    fetchIngestExtraction.mockResolvedValue({ ...exBody(), rows: [] });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector('[data-extraction-state="empty"]')).not.toBeNull());
    expect(document.querySelector("[data-extraction-failed]")).toBeNull();
  });

  it("the document is destroyed with the card", async () => {
    const { unmount } = await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

/**
 * What the outline IS (7f, 2026-10-17, doc-tools #132): a has-a-bbox test passes three qualities
 * alike. The card says which one the steward is looking at, in the outline and in words.
 */
describe("evidence quality", () => {
  const quality = () => outline()?.getAttribute("data-evidence-quality");
  const caption = () => document.querySelector("[data-evidence-caption]")?.textContent ?? "";

  it("a text_layer_cell row is outlined solid and captioned as the cell; no note, no quality flag", async () => {
    await mount();
    await waitFor(() => expect(quality()).toBe("cell"));
    expect(outline()!.className).not.toContain("border-dashed");
    expect(caption()).toBe("Outlined: the cell this row was read from.");
    expect(rowEls()[0].querySelector("[data-evidence-note]")).toBeNull();
    expect(flag("unknown-method")).toBeNull();
  });

  it("a region row is noted, outlined dashed, captioned as the whole table, and counted in a flag", async () => {
    await mount();
    expect(flag("region-evidence")!.textContent).toMatch(/^2 rows' outline is the whole table box, not the cell/);
    expect(rowEls()[5].querySelector('[data-evidence-note="region"]')!.textContent).toBe("table box, not the cell");
    fireEvent.click(document.querySelector('[data-show-row="row-5"]')!);
    await waitFor(() => expect(quality()).toBe("region"));
    expect(outline()!.className).toContain("border-dashed");
    expect(caption()).toMatch(/^Outlined: the whole table on p2, not the cell./);
  });

  it("inherited LTB rows: noted, jump to the stating sentence, and say one look clears all that share it", async () => {
    const b = exBody();
    // doc-tools #132: every inherited row carries the header date's ONE page + bbox.
    const sentence = { ...b.rows[0].evidence_ref!, page: 2, bbox: [72, 100, 400, 114] };
    for (const i of [0, 2]) {
      b.rows[i].obtained_via = "inherited_doc_level";
      b.rows[i].evidence_ref = { ...sentence };
    }
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    expect(rowEls()[2].querySelector('[data-evidence-note="inherited"]')!.textContent).toBe("from the document-level date");
    expect(rowEls()[1].querySelector("[data-evidence-note]")).toBeNull();
    await waitFor(() => expect(quality()).toBe("inherited"));
    expect(outline()!.getAttribute("data-evidence-outline-page")).toBe("2"); // not the row's page 1
    expect(caption()).toBe(
      "Outlined: the sentence on p2 that states the document-level date; the row inherits it. 2 rows inherit it: confirming it once confirms them all.",
    );
    expect(flag("unknown-method")).toBeNull();
  });

  it("a method the card does not know is never taken for the cell", async () => {
    const b = exBody();
    b.rows[0].obtained_via = "layout_prose";
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    await waitFor(() => expect(quality()).toBe("unknown"));
    expect(outline()!.className).toContain("border-dashed");
    expect(caption()).toMatch(/not claimed to be the cell/);
    expect(flag("unknown-method")!.textContent).toMatch(/^1 row came by a method this card does not know/);
  });
});

describe("keyboard", () => {
  it("j and k walk the rows, and the source follows", async () => {
    await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    for (let i = 0; i < 4; i++) key("j");
    expect(selectedKey()).toBe("row-4");
    await waitFor(() => expectOutlineOn(4));
    key("k");
    expect(selectedKey()).toBe("row-3");
    await waitFor(() => expectOutlineOn(3));
  });

  it("j stops at the last row and k at the first", async () => {
    await mount();
    key("k");
    expect(selectedKey()).toBe("row-0");
    for (let i = 0; i < 10; i++) key("j");
    expect(selectedKey()).toBe("row-5");
  });

  it("one p only ARMS promote; a second p sends it", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    key("p");
    expect(actOnHumanTask).not.toHaveBeenCalled();
    expect(document.querySelector("[data-promote-armed]")).not.toBeNull();
    key("p");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
    await waitFor(() => expect(document.querySelector('[data-act-outcome="resumed"]')).not.toBeNull());
  });

  it("p then Enter sends it too; Esc disarms", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    key("p");
    key("Escape");
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    key("Enter");
    expect(actOnHumanTask).not.toHaveBeenCalled();
    key("p");
    key("Enter");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
    expect(actOnHumanTask).toHaveBeenCalledTimes(1);
  });

  it("r opens the narrow codes, a digit picks one, Enter rejects with the code as the reason", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    key("r");
    expect(document.querySelector("[data-reject-codes]")).not.toBeNull();
    key("Enter");
    expect(actOnHumanTask).not.toHaveBeenCalled(); // no code yet, no reason, nothing sent
    key("2");
    key("Enter");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "rejected", "wrong_part"));
  });

  it("the note rides with the code", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    fireEvent.change(document.querySelector("[data-review-note]")!, { target: { value: "row 3 says 2028" } });
    key("r");
    fireEvent.click(document.querySelector('[data-reject-code="wrong_value"] input')!);
    fireEvent.click(document.querySelector("[data-reject-confirm]")!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "rejected", "wrong_value: row 3 says 2028"));
  });

  it("keys typed into the note are text, not commands", async () => {
    await mount();
    const note = document.querySelector("[data-review-note]")!;
    for (const k of ["j", "p", "p", "r"]) key(k, note);
    expect(selectedKey()).toBe("row-0");
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    expect(document.querySelector("[data-reject-codes]")).toBeNull();
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("with a modifier held, nothing fires (Ctrl+R is the browser's)", async () => {
    await mount();
    fireEvent.keyDown(card(), { key: "r", ctrlKey: true });
    fireEvent.keyDown(card(), { key: "j", metaKey: true });
    fireEvent.keyDown(card(), { key: "j", altKey: true });
    expect(document.querySelector("[data-reject-codes]")).toBeNull();
    expect(selectedKey()).toBe("row-0");
  });

  it("p and r still work while the extraction is failed: the decision does not wait on the rows", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    fetchIngestExtraction.mockRejectedValue({ response: { status: 503, data: { detail: { error: "artifact_store_unreachable" } } } });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")).not.toBeNull());
    key("p");
    key("p");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
  });
});

describe("the decision is the generic card's", () => {
  it("a click on Promote sends at once (a click is already deliberate)", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    fireEvent.click(document.querySelector('[data-verb="promoted"]')!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
  });

  it("Reject's confirm stays disabled until a code is chosen", async () => {
    await mount();
    fireEvent.click(document.querySelector('[data-verb="rejected"]')!);
    const confirm = document.querySelector("[data-reject-confirm]") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-reject-code="unreadable"] input')!);
    expect(confirm.disabled).toBe(false);
  });

  it("no code, nothing sent: even where the declaration does not require a reason on rejected", async () => {
    // The hook's reason_required check would otherwise stand in for the card's own guard; take it away.
    await mount(task({ declaration: { ...DECL, reason_required: [] } }));
    fireEvent.change(document.querySelector("[data-review-note]")!, { target: { value: "looks off" } });
    key("r");
    key("Enter");
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("the codes say they are cortex's proposal (nothing serves codes)", async () => {
    await mount();
    key("r");
    expect(document.querySelector("[data-reject-codes] legend")!.textContent).toContain("cortex-proposed");
    expect(document.querySelectorAll("[data-reject-code]")).toHaveLength(6);
  });

  it("a declaration that does not offer promoted gets no Promote, and p does nothing", async () => {
    await mount(task({ declaration: { ...DECL, accepts: ["rejected"] } }));
    expect(document.querySelector('[data-verb="promoted"]')).toBeNull();
    key("p");
    key("p");
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("a recorded-but-not-resumed promote says so, as the generic card does", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    await mount();
    fireEvent.click(document.querySelector('[data-verb="promoted"]')!);
    await waitFor(() => expect(document.querySelector('[data-act-outcome="recorded"]')).not.toBeNull());
    key("p");
    key("p");
    expect(actOnHumanTask).toHaveBeenCalledTimes(1); // done: the keys act no more
  });

  it("a 422 refusal is drawn inline and the buttons stay", async () => {
    actOnHumanTask.mockRejectedValue({
      response: { status: 422, data: { detail: { error: "promotion_payload_invalid", message: "missing object_ref" } } },
    });
    await mount();
    fireEvent.click(document.querySelector('[data-verb="promoted"]')!);
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).not.toBeNull());
    expect(document.querySelector("[data-act-refusal]")!.textContent).toContain("promotion_payload_invalid");
    expect(document.querySelector('[data-verb="promoted"]')).not.toBeNull();
  });
});
