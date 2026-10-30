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
import { NO_DECLARATION_SERVED } from "@/lib/taskDeclaration";

const actOnHumanTask = vi.fn();
const fetchIngestStatus = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a),
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
const fetchIngestSource = vi.fn();
const fetchIngestExtraction = vi.fn();
const correctIngestLeaf = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  correctIngestLeaf: (...a: unknown[]) => correctIngestLeaf(...a),
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

import { PdfEvidencePane } from "./PdfEvidencePane";
import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { fixtureExtractionBody, fixturePromotionPayload, FIXTURE_NOTICE_ID } from "@/lib/promotionReviewFixture";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";

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
type Row = Record<string, unknown> & { evidence_ref: { page: number; bbox: number[] } | null };
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

/** A /source answer whose bytes start like a PDF (pdf.js itself is stubbed). */
const pdfSource = (head = "%PDF-1.4\n%\xe2\xe3", contentType: string | null = "application/pdf") => ({
  bytes: new Uint8Array([...head].map((c) => c.charCodeAt(0))).buffer,
  status: 200,
  contentType,
});
const failedText = () => document.querySelector("[data-pdf-failed]")!.textContent!;

beforeEach(() => {
  correctIngestLeaf.mockReset();
  actOnHumanTask.mockReset();
  fetchIngestSource.mockReset().mockResolvedValue(pdfSource());
  fetchIngestExtraction.mockReset().mockImplementation(async () => exBody());
  renderPage.mockReset().mockImplementation(async (_n: number, _c: HTMLCanvasElement, w: number) => ({ width: w, height: (w * 792) / 612 }));
  destroy.mockReset();
  openPdf.mockReset().mockResolvedValue({ numPages: 2, renderPage, destroy });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const card = () => document.querySelector("[data-promotion-review]") as HTMLElement;
const rowEls = () => [...document.querySelectorAll("[data-review-row]")] as HTMLElement[];
const selectedKey = () => document.querySelector("[data-review-row][data-selected]")?.getAttribute("data-review-row");
const outline = () => document.querySelector("[data-evidence-outline]") as HTMLElement | null;
const flag = (k: string) => document.querySelector(`[data-review-flag="${k}"]`);
const key = (k: string, target: Element = card()) => fireEvent.keyDown(target, { key: k });
/** The pages renderPage was asked for, in order; and whether page n was drawn into page n's OWN slot. */
const drewPages = () => renderPage.mock.calls.map((c) => c[0] as number);
const drewInOwnSlot = (n: number) =>
  renderPage.mock.calls.some((c) => c[0] === n && (c[1] as HTMLElement).closest(`[data-pdf-slot="${n}"]`) !== null);
const shownPage = () => document.querySelector("[data-pdf-page]")?.getAttribute("data-pdf-page");
const pageSize = (w: number) => ({ width: w, height: (w * 792) / 612 });
const promoteBtn = () => document.querySelector('[data-verb="promoted"]') as HTMLButtonElement;
const rejectBtn = () => document.querySelector('[data-verb="rejected"]') as HTMLButtonElement;
const hold = () => promoteBtn().getAttribute("data-promote-hold");
const topline = (k: string) => document.querySelector(`[data-topline="${k}"]`)?.textContent?.replace(/^ · /, "");

/** Render, and wait until the extraction's rows are drawn. */
async function mount(t: ApprovalTaskPayload = task(), rows = 6) {
  const r = render(<ApprovalTaskCard task={t} />);
  await waitFor(() => expect(rowEls()).toHaveLength(rows));
  return r;
}

/** Mount, and wait until Promote is offered: rows drawn AND a page of the source drawn. */
async function mountPromotable(t: ApprovalTaskPayload = task(), rows = 6) {
  const r = await mount(t, rows);
  await waitFor(() => expect(promoteBtn().disabled).toBe(false));
  return r;
}

/** The outline's CSS box, and what the row's evidence_ref scales to at the drawn size. */
function expectOutlineOn(rowIndex: number, body: Body = exBody()) {
  const ref = body.rows[rowIndex].evidence_ref!;
  const el = outline();
  expect(el, `outline for row ${rowIndex}`).not.toBeNull();
  expect(el!.getAttribute("data-evidence-outline-page")).toBe(String(ref.page));
  const [x0, y0, x1, y1] = ref.bbox;
  // Rows are page fractions: the box scales by the drawn page (1x1 in the reader).
  const sx = W;
  const sy = (W * 792) / 612;
  expect(parseFloat(el!.style.left)).toBeCloseTo(x0 * sx, 3);
  expect(parseFloat(el!.style.top)).toBeCloseTo(y0 * sy, 3);
  expect(parseFloat(el!.style.width)).toBeCloseTo((x1 - x0) * sx, 3);
  expect(parseFloat(el!.style.height)).toBeCloseTo((y1 - y0) * sy, 3);
}

describe("which card draws", () => {
  it("a pending task renders no export control, even when the status would say promoted", async () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    fetchIngestStatus.mockReset().mockResolvedValue({ stage: "promoted" });
    await mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(card()).not.toBeNull();
    expect(document.querySelector("[data-review-export]")).toBeNull();
    expect(fetchIngestStatus).not.toHaveBeenCalled();
  });

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
    expect(topline("kind")).toBe("? · not identified"); // PCN/PDN is served by neither source
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
    expect(drewPages()[0]).toBe(1); // the page in front of the steward draws first
    expect(drewInOwnSlot(1)).toBe(true);
    expectOutlineOn(0);
    expect(document.querySelector("[data-pdf-page]")!.getAttribute("data-pdf-page")).toBe("1");
  });

  it("show on a row on page 2 (measured in px) jumps the PDF there and outlines that row", async () => {
    await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    fireEvent.click(document.querySelector('[data-show-row="row-5"]')!);
    expect(selectedKey()).toBe("row-5");
    await waitFor(() => expect(outline()?.getAttribute("data-evidence-outline-page")).toBe("2"));
    expect(drewInOwnSlot(2)).toBe(true);
    expect(outline()!.closest('[data-pdf-slot="2"]')).not.toBeNull();
    expect(shownPage()).toBe("2");
    expectOutlineOn(5);
  });

  it("a null-bbox row's show button says no box", async () => {
    fetchIngestExtraction.mockImplementation(async () => {
      const b = exBody();
      b.rows[1] = { ...b.rows[1], evidence_ref: { page: 2, bbox: null } as unknown as Row["evidence_ref"] };
      return b;
    });
    await mount();
    const btn = document.querySelector('[data-show-row="row-1"]') as HTMLElement;
    expect(btn.textContent).toBe("show p2 · no box");
    expect(btn.hasAttribute("data-show-no-box")).toBe(true);
    expect((document.querySelector('[data-show-row="row-0"]') as HTMLElement).hasAttribute("data-show-no-box")).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(shownPage()).toBe("2"));
    expect(outline()).toBeNull();
  });

  it("a no-box row carries no region or inherited note: there is no outline to qualify", async () => {
    fetchIngestExtraction.mockImplementation(async () => {
      const b = exBody();
      b.rows[0] = { ...b.rows[0], obtained_via: "region_preferred" };
      b.rows[1] = { ...b.rows[1], obtained_via: "region_preferred", evidence_ref: { page: 2, bbox: null } as unknown as Row["evidence_ref"] };
      b.rows[2] = { ...b.rows[2], obtained_via: "inherited_doc_level", evidence_ref: { page: 2, bbox: null } as unknown as Row["evidence_ref"] };
      return b;
    });
    await mount();
    const note = (i: number, q: string) => rowEls()[i].querySelector(`[data-evidence-note="${q}"]`);
    // Control: a boxed region row keeps its note, so the selector is live.
    expect(note(0, "region")).not.toBeNull();
    expect(note(1, "region")).toBeNull();
    expect(note(2, "doc_level")).toBeNull();
  });

  it("clicking the row itself selects it too", async () => {
    await mount();
    fireEvent.click(rowEls()[2]);
    expect(selectedKey()).toBe("row-2");
    await waitFor(() => expectOutlineOn(2));
  });

  it("no outline is drawn over a page that has not finished drawing", async () => {
    let finish!: () => void;
    renderPage.mockImplementation((n: number, _c: HTMLCanvasElement, w: number) =>
      n === 2 ? new Promise((r) => (finish = () => r(pageSize(w)))) : Promise.resolve(pageSize(w)),
    );
    await mount();
    await waitFor(() => expect(outline()).not.toBeNull());
    fireEvent.click(document.querySelector('[data-show-row="row-4"]')!);
    expect(selectedKey()).toBe("row-4");
    await waitFor(() => expect(drewPages()).toContain(2));
    expect(outline()).toBeNull(); // row 4's box is NOT drawn while page 2 is still drawing, nor left on page 1
    finish();
    await waitFor(() => expectOutlineOn(4));
  });

  it("the malformed banner lists each failing check, largest first, and samples the FIRST bad row", async () => {
    const b = exBody();
    const bad = (i: number, ref: unknown) => (b.rows[i] = { ...b.rows[i], evidence_ref: ref as Row["evidence_ref"] });
    bad(0, { page: 1, bbox: [40, 60, 560, 110] }); // bbox_not_fractions (first)
    bad(1, "p2"); // not_an_object
    bad(2, { page: 1, bbox: [40, 60, 560, 110] });
    bad(3, { page: 1, bbox: [70, 80, 570, 120] }); // same reason, a different value: the LAST row must not be the sample
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    const spans = [...document.querySelectorAll("[data-review-flag-reason]")];
    expect(spans.map((e) => [e.getAttribute("data-review-flag-reason"), e.getAttribute("data-count")])).toEqual([
      ["bbox_not_fractions", "3"],
      ["not_an_object", "1"],
    ]);
    expect(flag("malformed-evidence")!.textContent).toContain("4 rows carry an evidence_ref that cannot be read: 3 bbox is not page fractions");
    const sample = flag("malformed-evidence-sample")!;
    expect(sample.querySelector("code")!.textContent).toBe(JSON.stringify({ page: 1, bbox: [40, 60, 560, 110] }));
    const badge = within(rowEls()[1]).getByText("unreadable");
    expect(badge.getAttribute("data-malformed-reason")).toBe("not_an_object");
    expect(badge.getAttribute("title")).toBe("evidence_ref is not an object");
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
    await waitFor(() => expect(drewInOwnSlot(1)).toBe(true));
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
    await waitFor(() => expect(drewInOwnSlot(1)).toBe(true));
    expect(outline()).toBeNull();
    expect(shownPage()).toBe("1");
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

  it("an extraction route not served yet (a plain 404) says so; the source and Reject remain", async () => {
    fetchIngestExtraction.mockRejectedValue({ response: { status: 404, data: { detail: "Not Found" } } });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")).not.toBeNull());
    expect(document.querySelector("[data-extraction-failed]")!.textContent).toContain("answered a bare 404");
    expect(rowEls()).toHaveLength(0);
    expect(document.querySelector("[data-review-title]")!.textContent).toBe(FIXTURE_NOTICE_ID); // the payload's
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(false);
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
    const sentence = { ...b.rows[0].evidence_ref!, page: 2, bbox: [0.12, 0.13, 0.65, 0.15] };
    for (const i of [0, 2]) {
      b.rows[i].obtained_via = "inherited_doc_level";
      b.rows[i].evidence_ref = { ...sentence };
    }
    fetchIngestExtraction.mockResolvedValue(b);
    await mount();
    expect(rowEls()[2].querySelector('[data-evidence-note="doc_level"]')!.textContent).toBe("doc_level");
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

describe("the inherited-date note is on the header, once; the rows say doc_level", () => {
  const via = (i: number) => rowEls()[i].querySelector('[data-cell="via"]')!;
  const setup = (spec: Array<[string, string]>) => {
    const b = exBody();
    spec.forEach(([field, ob], i) => {
      b.rows[i].field = field;
      b.rows[i].obtained_via = ob;
    });
    fetchIngestExtraction.mockResolvedValue(b);
  };

  it("three inherited ltb_date rows and one cell row: ONE header note, three doc_level rows, no per-row sentence", async () => {
    setup([["ltb_date", "inherited_doc_level"], ["ltb_date", "inherited_doc_level"], ["ltb_date", "inherited_doc_level"], ["eol_date", "text_layer_cell"]]);
    await mount();
    const notes = document.querySelectorAll("[data-review-inherited-note]");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain("ltb_date inherited from the document-level date");
    expect(notes[0].textContent).toContain("3");
    for (const i of [0, 1, 2]) {
      expect(via(i).textContent, `row ${i}`).toBe("doc_level");
      expect(via(i).querySelector('[data-evidence-note="doc_level"]'), `row ${i}`).not.toBeNull();
    }
    for (const el of rowEls()) expect(el.textContent).not.toContain("from the document-level date");
    expect(via(3).textContent).toBe("text_layer_cell");
    expect(via(3).querySelector("[data-evidence-note]")).toBeNull();
  });

  it("inherited rows from two fields: the note names both, in row order, with the inherited count", async () => {
    setup([["notice_date", "inherited_doc_level"], ["ltb_date", "inherited_doc_level"], ["notice_date", "inherited_doc_level"], ["eol_date", "text_layer_cell"]]);
    await mount();
    const note = document.querySelector("[data-review-inherited-note]")!.textContent!;
    expect(note).toContain("notice_date, ltb_date inherited from the document-level date");
    expect(note).toContain("3 rows");
  });

  it("no inherited rows: no note", async () => {
    setup([["ltb_date", "text_layer_cell"], ["ltb_date", "region_preferred"]]);
    await mount();
    expect(document.querySelector("[data-review-inherited-note]")).toBeNull();
    expect(document.querySelector('[data-evidence-note="doc_level"]')).toBeNull();
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
    await mountPromotable();
    key("p");
    expect(actOnHumanTask).not.toHaveBeenCalled();
    expect(document.querySelector("[data-promote-armed]")).not.toBeNull();
    key("p");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
    await waitFor(() => expect(document.querySelector('[data-act-outcome="resumed"]')).not.toBeNull());
  });

  it("p then Enter sends it too; Esc disarms", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
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
    key("3");
    key("Enter");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "rejected", "parts_unusable"));
  });

  it("the note rides with the code", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mount();
    fireEvent.change(document.querySelector("[data-review-note]")!, { target: { value: "same notice as drop 4f" } });
    key("r");
    fireEvent.click(document.querySelector('[data-reject-code="duplicate"] input')!);
    fireEvent.click(document.querySelector("[data-reject-confirm]")!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "rejected", "duplicate: same notice as drop 4f"));
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

  it("while the extraction is failed, p does nothing and r still rejects: Reject does not wait on the rows", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    fetchIngestExtraction.mockRejectedValue({ response: { status: 503, data: { detail: { error: "artifact_store_unreachable" } } } });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector("[data-extraction-failed]")).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    key("p");
    key("p");
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    key("r");
    key("1");
    key("Enter");
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0][1]).toBe("rejected");
  });
});

/**
 * PROMOTE ONLY ON WHAT THE STEWARD CAN SEE (the architect, 2026-10-17, rows fa231498 and 0096a523:
 * no rows, and a source that would not render, sat promotable in bob's queue). Promote needs a
 * drawn row AND a drawn page; Reject needs neither. Each arm is one missing half, so the near side
 * of each condition is a case of its own.
 */
describe("Promote is offered only on what the steward can see", () => {
  it("rows and a drawn page: Promote is enabled and holds nothing", async () => {
    await mount();
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    expect(hold()).toBeNull();
    expect(document.querySelector("[data-promote-held]")).toBeNull();
  });

  it("rows=0: Promote is off and says why; Reject stays enabled and rejects not_a_notice", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    fetchIngestExtraction.mockResolvedValue({ ...exBody(), rows: [] });
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector('[data-extraction-state="empty"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(promoteBtn().disabled).toBe(true);
    expect(hold()).toBe("no-rows");
    expect(document.querySelector('[data-promote-held="no-rows"]')!.textContent).toContain("no extracted rows to vet");
    expect(rejectBtn().disabled).toBe(false);
    key("p");
    key("p");
    key("Enter");
    expect(actOnHumanTask).not.toHaveBeenCalled();
    fireEvent.click(rejectBtn());
    fireEvent.click(document.querySelector('[data-reject-code="not_a_notice"] input')!);
    fireEvent.click(document.querySelector("[data-reject-confirm]")!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "rejected", "not_a_notice"));
  });

  it("a row dropped for having no mpn is not a row to vet: all dropped is rows=0", async () => {
    const b = exBody();
    b.rows = b.rows.slice(0, 1).map((r) => ({ ...r, mpn: null }));
    fetchIngestExtraction.mockResolvedValue(b);
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(flag("dropped-rows")).not.toBeNull());
    expect(hold()).toBe("no-rows");
  });

  it("a source the server refuses: Promote is off and says why; Reject stays enabled", async () => {
    fetchIngestSource.mockRejectedValue({ response: { status: 404, data: { detail: { error: "source_absent" } } } });
    await mount();
    await waitFor(() => expect(document.querySelector('[data-pdf-state="failed"]')).not.toBeNull());
    expect(promoteBtn().disabled).toBe(true);
    expect(hold()).toBe("no-source");
    expect(document.querySelector('[data-promote-held="no-source"]')!.textContent).toContain("cannot vet what they cannot see");
    expect(rejectBtn().disabled).toBe(false);
  });

  it("bytes that are not a PDF (openPdf throws): no-source, and the pane shows what came back", async () => {
    fetchIngestSource.mockResolvedValue(pdfSource("<!doctype html>", "text/html"));
    openPdf.mockRejectedValue(new Error("Invalid PDF structure."));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await waitFor(() => expect(hold()).toBe("no-source"));
    expect(rejectBtn().disabled).toBe(false);
    expect(failedText()).toContain('The source answered 200 text/html, 15 bytes, but they are not a PDF: they begin "<!doctype html>".');
    err.mockRestore();
  });

  // THE P0 (10-18/19): a real PDF, refused by pdf.js because the browser would not load its worker.
  // The pane said "could not be read as a PDF" and hid this. It must show pdf.js's own words.
  it("a PDF pdf.js cannot open: the pane names the answer AND pdf.js's error, never the generic sentence", async () => {
    openPdf.mockRejectedValue(new Error("Setting up fake worker failed: \"Failed to fetch dynamically imported module: http://localhost:18080/assets/pdf.worker.min-Dswkl-cV.mjs\"."));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await waitFor(() => expect(hold()).toBe("no-source"));
    const t = failedText();
    expect(t).toContain('The source answered 200 application/pdf, 12 bytes beginning "%PDF-1.4\\x0a%\\xe2\\xe3", and pdf.js could not open it: Error: Setting up fake worker failed');
    expect(t).toContain("pdf.worker.min-Dswkl-cV.mjs");
    expect(t).not.toContain("could not be read as a PDF");
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("a page that will not draw: no-source, and the pane carries the render error", async () => {
    renderPage.mockRejectedValue(new Error("draw failed"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await waitFor(() => expect(hold()).toBe("no-source"));
    expect(failedText()).toContain("Page 1 could not be drawn: Error: draw failed");
    err.mockRestore();
  });

  it("a fetch with no answer at all names the request failure, not the bytes", async () => {
    fetchIngestSource.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await waitFor(() => expect(hold()).toBe("no-source"));
    expect(failedText()).toContain("The source request failed before any answer (TypeError: Failed to fetch).");
    expect(openPdf).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("an opened document whose page has not drawn yet is still loading: Promote waits, with no off line", async () => {
    renderPage.mockReturnValue(new Promise(() => {}));
    await mount();
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(promoteBtn().disabled).toBe(true);
    expect(hold()).toBe("source-loading");
    expect(document.querySelector("[data-promote-held]")).toBeNull();
    expect(rejectBtn().disabled).toBe(false);
  });

  it("p pressed while the page is still drawing arms nothing: once it draws, Promote is not already armed", async () => {
    let draw!: (v: { width: number; height: number }) => void;
    renderPage.mockReturnValueOnce(new Promise((r) => (draw = r)));
    await mount();
    await waitFor(() => expect(hold()).toBe("source-loading"));
    key("p");
    draw({ width: W, height: (W * 792) / 612 });
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    key("Enter");
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("rows not yet arrived: Promote waits; Reject does not", async () => {
    fetchIngestExtraction.mockReturnValue(new Promise(() => {}));
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(hold()).toBe("rows-loading");
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(false);
  });

  it("armed while promotable, then another page fails to draw: Enter sends nothing, and that page says why", async () => {
    let fail!: (e: Error) => void;
    renderPage.mockImplementation((n: number, _c: HTMLCanvasElement, w: number) =>
      n === 2 ? new Promise((_r, j) => (fail = j)) : Promise.resolve(pageSize(w)),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    key("p");
    expect(document.querySelector("[data-promote-armed]")).not.toBeNull();
    fail(new Error("draw failed"));
    await waitFor(() => expect(hold()).toBe("no-source"));
    // A steward who cannot read page 2 cannot vet the document; page 1 stays readable beside it.
    expect(document.querySelector('[data-pdf-slot="2"] [data-pdf-failed]')!.textContent).toContain("Page 2 could not be drawn: Error: draw failed");
    expect(document.querySelector('[data-pdf-slot="1"]')!.hasAttribute("data-pdf-slot-drawn")).toBe(true);
    err.mockRestore();
    expect(document.querySelector("[data-promote-armed]")).toBeNull();
    key("Enter");
    key("p");
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });
});

describe("the decision is the generic card's", () => {
  it("a click on Promote sends at once (a click is already deliberate)", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
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

  it("offers the producer's four codes, in order, and no longer calls them a proposal (c1dbbf6c, served from 198)", async () => {
    await mount();
    key("r");
    expect(document.querySelector("[data-reject-codes] legend")!.textContent).not.toContain("proposed");
    expect([...document.querySelectorAll("[data-reject-code]")].map((e) => e.getAttribute("data-reject-code"))).toEqual([
      "not_a_notice",
      "unreadable",
      "parts_unusable",
      "duplicate",
    ]);
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
    await mountPromotable();
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
    await mountPromotable();
    fireEvent.click(document.querySelector('[data-verb="promoted"]')!);
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).not.toBeNull());
    expect(document.querySelector("[data-act-refusal]")!.textContent).toContain("promotion_payload_invalid");
    expect(document.querySelector('[data-verb="promoted"]')).not.toBeNull();
  });

  it("a decision on a task whose leaf changed is refused with the server's message", async () => {
    const message = "The kind changed to PDN after this task was filed.";
    actOnHumanTask.mockRejectedValue({ response: { status: 409, data: { detail: { error: "leaf_changed", message } } } });
    await mountPromotable();
    fireEvent.click(document.querySelector('[data-verb="promoted"]')!);
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).not.toBeNull());
    expect(document.querySelector("[data-act-refusal]")!.textContent).toContain(message);
    expect(document.querySelector('[data-act-outcome]')).toBeNull();
    expect(document.querySelector('[data-verb="promoted"]')).not.toBeNull();
  });
});

describe("the steward can read every page (the architect, 197: PAGE 1 / 2 with no way to page)", () => {
  // jsdom lays nothing out: each page slot stands 1000px below the last, and the scroller is given
  // a real scrollTop and a 700px view over the two pages.
  const H = 1000;
  let restore: () => void;
  beforeEach(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!;
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        const n = this.dataset.pdfSlot;
        return n ? (Number(n) - 1) * H : 0;
      },
    });
    restore = () => Object.defineProperty(HTMLElement.prototype, "offsetTop", d);
  });
  afterEach(() => restore());

  const scroller = () => {
    const el = document.querySelector("[data-pdf-scroller]") as HTMLElement;
    Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 700, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 2 * H, configurable: true });
    return el;
  };
  const input = () => document.querySelector("[data-pdf-page-input]") as HTMLInputElement;
  const prevBtn = () => document.querySelector("[data-pdf-prev]") as HTMLButtonElement;
  const nextBtn = () => document.querySelector("[data-pdf-next]") as HTMLButtonElement;
  const typePage = (v: string, k = "Enter") => {
    fireEvent.change(input(), { target: { value: v } });
    fireEvent.keyDown(input(), { key: k });
  };

  it("every page is drawn, each into its own slot", async () => {
    await mount();
    await waitFor(() => expect(drewInOwnSlot(2)).toBe(true));
    expect(drewInOwnSlot(1)).toBe(true);
    expect(document.querySelectorAll("[data-pdf-slot]")).toHaveLength(2);
    expect(document.querySelector("[data-pdf-pages]")!.getAttribute("data-pdf-pages")).toBe("2");
  });

  it("prev / next page the source, and stop at the ends", async () => {
    await mountPromotable();
    const sc = scroller();
    expect(shownPage()).toBe("1");
    expect(prevBtn().disabled).toBe(true);
    fireEvent.click(nextBtn());
    expect(shownPage()).toBe("2");
    expect(sc.scrollTop).toBe(H);
    expect(nextBtn().disabled).toBe(true);
    fireEvent.click(prevBtn());
    expect(shownPage()).toBe("1");
    expect(sc.scrollTop).toBe(0);
  });

  it("[ and ] page from the keyboard; typed into the page box they are text, not paging", async () => {
    await mountPromotable();
    const sc = scroller();
    key("]");
    expect(shownPage()).toBe("2");
    expect(sc.scrollTop).toBe(H);
    key("]");
    expect(shownPage()).toBe("2");
    key("[");
    expect(shownPage()).toBe("1");
    expect(sc.scrollTop).toBe(0);
    key("]", input());
    expect(shownPage()).toBe("1");
  });

  it("the page box goes to the page typed, clamps to the document, and ignores what is not a number", async () => {
    await mountPromotable();
    const sc = scroller();
    typePage("2");
    expect(shownPage()).toBe("2");
    expect(sc.scrollTop).toBe(H);
    expect(input().value).toBe("2");
    typePage("9");
    expect(shownPage()).toBe("2");
    typePage("0");
    expect(shownPage()).toBe("1");
    typePage("x");
    expect(shownPage()).toBe("1");
    expect(input().value).toBe("1");
    typePage("2", "Escape");
    expect(shownPage()).toBe("1");
    expect(input().value).toBe("1");
  });

  it("the indicator follows a scroll by hand, and names the last page at the bottom", async () => {
    await mountPromotable();
    const sc = scroller();
    sc.scrollTop = 900; // the upper quarter of the view is on page 2
    fireEvent.scroll(sc);
    expect(shownPage()).toBe("2");
    sc.scrollTop = 100;
    fireEvent.scroll(sc);
    expect(shownPage()).toBe("1");
    sc.scrollTop = 2 * H - 700;
    fireEvent.scroll(sc);
    expect(shownPage()).toBe("2");
  });

  it("Promote waits on the page IN FRONT of the steward: a row on a page still drawing holds it, whatever else has drawn", async () => {
    let finish!: () => void;
    renderPage.mockImplementation((n: number, _c: HTMLCanvasElement, w: number) =>
      n === 2 ? new Promise((r) => (finish = () => r(pageSize(w)))) : Promise.resolve(pageSize(w)),
    );
    await mountPromotable(); // page 1 drawn, row 0 on it
    fireEvent.click(document.querySelector('[data-show-row="row-5"]')!); // row 5 is on page 2
    await waitFor(() => expect(hold()).toBe("source-loading"));
    expect(promoteBtn().disabled).toBe(true);
    finish();
    await waitFor(() => expect(promoteBtn().disabled).toBe(false));
    expectOutlineOn(5);
  });

  it("show jumps back to the crop after the steward paged away, even on the row already selected", async () => {
    const centred: Element[] = [];
    const had = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Element.prototype.scrollIntoView = function (this: Element) {
      centred.push(this);
    };
    try {
      await mountPromotable();
      await waitFor(() => expect(outline()).not.toBeNull());
      const sc = scroller();
      key("]");
      expect(shownPage()).toBe("2");
      centred.length = 0;
      fireEvent.click(document.querySelector('[data-show-row="row-0"]')!);
      expect(selectedKey()).toBe("row-0");
      expect(shownPage()).toBe("1");
      expect(sc.scrollTop).toBe(centreOf(outline() as HTMLElement, 1));
      expect(centred).not.toContain(outline());
    } finally {
      if (had) Object.defineProperty(Element.prototype, "scrollIntoView", had);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  // The outline's centre, as the pane's own scrollTop: its slot's top, plus its middle, less half the
  // 700px view. Not the page top: a jump that only paged would leave the crop off-centre.
  const centreOf = (o: HTMLElement, page: number) =>
    Math.max(0, (page - 1) * H + parseFloat(o.style.top) + parseFloat(o.style.height) / 2 - 700 / 2);

  it("centring the crop scrolls the pane, never what holds it (10-28: the expanded card scrolled its tabs off the top)", async () => {
    const called: Element[] = [];
    const had = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Element.prototype.scrollIntoView = function (this: Element) {
      called.push(this);
    };
    try {
      await mountPromotable();
      await waitFor(() => expect(outline()).not.toBeNull());
      const sc = scroller();
      called.length = 0;
      fireEvent.click(document.querySelector('[data-show-row="row-5"]')!); // row 5 is on page 2
      await waitFor(() => expect(outline()?.getAttribute("data-evidence-outline-page")).toBe("2"));
      await waitFor(() => expect(sc.scrollTop).toBe(centreOf(outline() as HTMLElement, 2)));
      expect(sc.scrollTop, "centred on the crop, not parked at page 2's top").not.toBe(H);
      // scrollIntoView scrolls EVERY scrollable ancestor; nothing inside the pane may call it.
      expect(called.filter((e) => e.closest("[data-pdf-scroller]")), "an element in the pane called scrollIntoView").toEqual([]);
    } finally {
      if (had) Object.defineProperty(Element.prototype, "scrollIntoView", had);
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

// ── the steward row editor ──────────────────────────────────────────────────────────────────
describe("row edits on a promote", () => {
  const setFlag = (v: string | null) => {
    (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = v === null ? undefined : { VITE_PROMOTION_ROW_EDITS: v };
  };
  afterEach(() => setFlag(null));
  const q = (attr: string, val?: string) =>
    document.querySelector(val === undefined ? `[${attr}]` : `[${attr}="${val}"]`) as HTMLElement | null;
  const type = (el: HTMLElement | null, value: string) => fireEvent.change(el!, { target: { value } });
  const click = (el: HTMLElement | null) => fireEvent.click(el!);
  const lastCall = () => actOnHumanTask.mock.calls[actOnHumanTask.mock.calls.length - 1] as unknown[];
  const failWith = (status: number, detail: unknown) =>
    actOnHumanTask.mockRejectedValueOnce({ response: { status, data: { detail } } });

  it("flag ON: fix a row, then promote, sends the correction with the evidence page", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    click(q("data-row-fix", "BYV34-400"));
    expect((q("data-fix-evidence", "BYV34-400") as HTMLInputElement).value).toBe("p.1");
    type(q("data-fix-mpn", "BYV34-400"), "BYV34-4000");
    expect(q("data-corrected-to")!.textContent).toContain("BYV34-4000");
    expect(promoteBtn().getAttribute("data-row-edit-count")).toBe("1");
    expect(promoteBtn().textContent).toContain("Promote with 1 edit");
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", "", undefined, {
      deleted: [],
      added: [],
      corrected: [{ mpn: "BYV34-400", corrected_mpn: "BYV34-4000", evidence: "p.1" }],
    });
  });

  it("delete with a reason is sent in deleted[]; undo takes the edit back", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    click(q("data-row-delete", "BYV34-500"));
    expect(q("data-deleted")).not.toBeNull();
    expect(q("data-row-edits-incomplete")).not.toBeNull();
    expect(promoteBtn().disabled).toBe(true);
    type(q("data-delete-reason", "BYV34-500"), "not a part");
    expect(promoteBtn().disabled).toBe(false);
    click(q("data-row-undo", "BYV34-500"));
    expect(q("data-deleted")).toBeNull();
    click(q("data-row-delete", "BYV34-500"));
    type(q("data-delete-reason", "BYV34-500"), "not a part");
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalled());
    expect(lastCall()[4]).toEqual({ deleted: [{ mpn: "BYV34-500", reason: "not a part" }], added: [], corrected: [] });
  });

  it("add a missed part sends it in added[] with its disposition", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    type(q("data-add-mpn"), "NEW-1");
    type(q("data-add-disposition"), "archive");
    type(q("data-add-reason"), "missed in table 2");
    expect((q("data-row-add") as HTMLButtonElement).disabled).toBe(true);
    type(q("data-add-evidence"), "p.2");
    click(q("data-row-add"));
    expect(q("data-row-added", "NEW-1")).not.toBeNull();
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalled());
    expect(lastCall()[4]).toEqual({
      deleted: [],
      corrected: [],
      added: [{ mpn: "NEW-1", disposition: "archive", reason: "missed in table 2", evidence: "p.2" }],
    });
  });

  it("a blank evidence disables Promote and says why; p does not arm", async () => {
    setFlag("true");
    await mountPromotable();
    click(q("data-row-fix", "BYV34-400"));
    type(q("data-fix-mpn", "BYV34-400"), "BYV34-4000");
    type(q("data-fix-evidence", "BYV34-400"), "  ");
    expect(promoteBtn().disabled).toBe(true);
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/blank/);
    key("p");
    expect(q("data-promote-armed")).toBeNull();
  });

  it("a corrected or added mpn colliding (other case) with an extracted row holds Promote", async () => {
    setFlag("true");
    await mountPromotable();
    click(q("data-row-fix", "BYV34-400"));
    type(q("data-fix-mpn", "BYV34-400"), "byv34-500");
    expect(promoteBtn().disabled).toBe(true);
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/collides with an extracted row/);
    type(q("data-fix-mpn", "BYV34-400"), "byv34-400");
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/equals its mpn/);
    click(q("data-row-undo", "BYV34-400"));
    type(q("data-add-mpn"), "byv34-500");
    type(q("data-add-reason"), "r");
    type(q("data-add-evidence"), "p.1");
    click(q("data-row-add"));
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/added byv34-500 collides with an extracted row/);
    expect(promoteBtn().disabled).toBe(true);
  });

  it("two rows sharing an mpn show one fix control, and a delete marks every one of them", async () => {
    setFlag("true");
    await mountPromotable();
    expect(document.querySelectorAll('[data-row-fix="BYV34-400"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-row-fix]")).toHaveLength(2);
    click(q("data-row-delete", "BYV34-400"));
    expect(document.querySelectorAll("[data-deleted]")).toHaveLength(3);
  });

  it("typing in an editor input does not trigger the card's keys", async () => {
    setFlag("true");
    await mountPromotable();
    click(q("data-row-fix", "BYV34-400"));
    key("p", q("data-fix-mpn", "BYV34-400")!);
    key("j", q("data-fix-mpn", "BYV34-400")!);
    expect(q("data-promote-armed")).toBeNull();
    expect(selectedKey()).toBe("row-0");
  });

  it("a reject with drafted edits sends no row_edits and says the edits are dropped", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    click(q("data-row-delete", "BYV34-500"));
    type(q("data-delete-reason", "BYV34-500"), "x");
    expect(q("data-reject-drops-edits")).toBeNull();
    click(rejectBtn());
    expect(q("data-reject-drops-edits")!.textContent).toMatch(/sends no row edits/);
    click(document.querySelector("[data-reject-code] input") as HTMLElement);
    click(q("data-reject-confirm"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalled());
    expect(lastCall()[1]).toBe("rejected");
    expect(lastCall()[4]).toBeUndefined();
  });

  it("a 503 extraction_defect_not_filed locks the editor; promoting again sends equal row_edits", async () => {
    setFlag("true");
    failWith(503, { error: "extraction_defect_not_filed", task_id: "t-promo", record_id: "r", message: "not filed" });
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    click(q("data-row-fix", "BYV34-400"));
    type(q("data-fix-mpn", "BYV34-400"), "BYV34-4000");
    click(promoteBtn());
    await waitFor(() => expect(q("data-row-edits-locked")).not.toBeNull());
    expect((q("data-fix-mpn", "BYV34-400") as HTMLInputElement).disabled).toBe(true);
    expect((q("data-row-add") as HTMLButtonElement).disabled).toBe(true);
    expect((q("data-add-mpn") as HTMLInputElement).disabled).toBe(true);
    expect(promoteBtn().disabled).toBe(false);
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(2));
    expect(actOnHumanTask.mock.calls[1][4]).toEqual(actOnHumanTask.mock.calls[0][4]);
    expect(JSON.stringify(actOnHumanTask.mock.calls[1][4])).toBe(JSON.stringify(actOnHumanTask.mock.calls[0][4]));
  });

  it("a FastAPI validation list is read, not shown as a bare Refused (422)", async () => {
    setFlag("true");
    failWith(422, [{ loc: ["body", "row_edits", "added", 0, "mpn"], msg: "must not be blank" }]);
    await mountPromotable();
    click(q("data-row-delete", "BYV34-500"));
    type(q("data-delete-reason", "BYV34-500"), "x");
    click(promoteBtn());
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).not.toBeNull());
    expect(document.querySelector("[data-act-refusal]")!.textContent).toMatch(/must not be blank/);
  });

  it("the success toast names the extraction_defect", async () => {
    setFlag("true");
    const { toast } = await import("sonner");
    actOnHumanTask.mockResolvedValue({
      workflow_resumed: true,
      row_edits: { corrected: 1, added: 0, deleted: 1 },
      extraction_defect: "ed-77",
    });
    await mountPromotable();
    click(q("data-row-delete", "BYV34-500"));
    type(q("data-delete-reason", "BYV34-500"), "x");
    click(q("data-row-fix", "BYV34-400"));
    type(q("data-fix-mpn", "BYV34-400"), "Z-1");
    click(promoteBtn());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("2 correction(s) filed as ed-77")));
  });

  it("flag OFF: no editor, and a promote sends no row_edits", async () => {
    setFlag("false");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    expect(q("data-row-fix")).toBeNull();
    expect(q("data-row-add-form")).toBeNull();
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("t-promo", "promoted", ""));
    expect(lastCall()[4]).toBeUndefined();
  });
});

// ── header edits and the leaf ───────────────────────────────────────────────────────────────
describe("header edits and the leaf on the promotion card", () => {
  const setFlag = (v: string | null) => {
    (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = v === null ? undefined : { VITE_PROMOTION_ROW_EDITS: v };
  };
  afterEach(() => setFlag(null));
  const q = (attr: string, val?: string) =>
    document.querySelector(val === undefined ? `[${attr}]` : `[${attr}="${val}"]`) as HTMLElement | null;
  const type = (el: HTMLElement | null, value: string) => fireEvent.change(el!, { target: { value } });
  const click = (el: HTMLElement | null) => fireEvent.click(el!);
  const lastCall = () => actOnHumanTask.mock.calls[actOnHumanTask.mock.calls.length - 1] as unknown[];

  it("a header-only promote sends header_edits and no row_edits in the BODY", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    click(q("data-header-fix", "mfr"));
    expect(q("data-header-form", "mfr")!.textContent).toContain("extracted: Example Discretes Ltd");
    expect((q("data-header-evidence", "mfr") as HTMLInputElement).value).toBe("p1");
    expect(promoteBtn().disabled).toBe(true);
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/header/);
    type(q("data-header-value", "mfr"), "example discretes ltd");
    type(q("data-header-reason", "mfr"), "logo reads Acme");
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/equals the extracted value/);
    type(q("data-header-value", "mfr"), "Acme Ltd");
    expect(q("data-header-corrected", "mfr")!.textContent).toContain("Acme Ltd");
    expect(promoteBtn().getAttribute("data-row-edit-count")).toBe("1");
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    const args = lastCall();
    expect(args.slice(0, 4)).toEqual(["t-promo", "promoted", "", undefined]);
    expect(args[4]).toBeUndefined();
    expect(args[5]).toBeUndefined();
    const headerEdits = [{ field: "mfr", value: "Acme Ltd", evidence_ref: "p1", reason: "logo reads Acme" }];
    expect(args[6]).toEqual(headerEdits);
    const { buildActBody } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
    const body = buildActBody("promoted", "", undefined, args[4] as undefined, args[5] as undefined, args[6] as never);
    expect("row_edits" in body).toBe(false);
    expect(body.header_edits).toEqual(headerEdits);
  });

  /** The extraction's notice with `mfr: "TYC"` from the given source; the payload's mfr agrees. */
  const tycMount = async (mfr_source: string) => {
    fetchIngestExtraction.mockImplementation(async () => ({
      ...exBody(),
      notice: { mfr: "TYC", mfr_source, mfr_parent: null, notice_date: "2026-09-30" },
    }));
    await mountPromotable(task({ payload: payload193({ mfr: "TYC" }) }));
  };

  it("TYC: a value equal to the identity FALLBACK is the correction, shown as a fallback and sent", async () => {
    setFlag("true");
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await tycMount("identity");
    expect(topline("manufacturer")).toBe("TYC (from identity, header blank)");
    click(q("data-header-fix", "mfr"));
    expect(q("data-header-extracted", "mfr")!.textContent).toBe("mfr: TYC (from identity, header blank)");
    type(q("data-header-value", "mfr"), "TYC");
    type(q("data-header-reason", "mfr"), "header blank; the notice names TYC");
    expect(q("data-row-edits-incomplete")).toBeNull();
    click(promoteBtn());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(lastCall()[6]).toEqual([{ field: "mfr", value: "TYC", evidence_ref: "p1", reason: "header blank; the notice names TYC" }]);
  });

  it("the same value is refused when the mfr is the header's own (mfr_source header)", async () => {
    setFlag("true");
    await tycMount("header");
    expect(topline("manufacturer")).toBe("TYC");
    click(q("data-header-fix", "mfr"));
    expect(q("data-header-extracted", "mfr")!.textContent).toBe("mfr extracted: TYC");
    type(q("data-header-value", "mfr"), "tyc");
    type(q("data-header-reason", "mfr"), "r");
    expect(q("data-row-edits-incomplete")!.textContent).toMatch(/equals the extracted value/);
    expect(promoteBtn().disabled).toBe(true);
  });

  it("header and row edits count together; undo removes a header draft", async () => {
    setFlag("true");
    await mountPromotable();
    key("]");
    click(q("data-header-fix", "notice_date"));
    expect((q("data-header-evidence", "notice_date") as HTMLInputElement).value).toBe("p2");
    click(q("data-row-delete", "BYV34-500"));
    expect(promoteBtn().getAttribute("data-row-edit-count")).toBe("2");
    click(q("data-header-undo", "notice_date"));
    expect(q("data-header-form", "notice_date")).toBeNull();
    expect(promoteBtn().getAttribute("data-row-edit-count")).toBe("1");
  });

  it("the 503 lock covers the header editor, and a reject notes the dropped header drafts", async () => {
    setFlag("true");
    actOnHumanTask.mockRejectedValueOnce({
      response: { status: 503, data: { detail: { error: "extraction_defect_not_filed", task_id: "t-promo", record_id: "r", message: "m" } } },
    });
    await mountPromotable();
    click(q("data-header-fix", "notice_id"));
    type(q("data-header-value", "notice_id"), "EOL-99");
    type(q("data-header-reason", "notice_id"), "typo");
    click(rejectBtn());
    expect(q("data-reject-drops-edits")).not.toBeNull();
    click(rejectBtn());
    click(promoteBtn());
    await waitFor(() => expect(q("data-row-edits-locked")).not.toBeNull());
    expect((q("data-header-value", "notice_id") as HTMLInputElement).disabled).toBe(true);
    expect((q("data-header-fix", "mfr") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flag OFF: no header fix controls", async () => {
    setFlag("false");
    await mountPromotable();
    expect(q("data-header-fix")).toBeNull();
  });

  it("the topline kind is the leaf upper-cased with its source, or the unnamed text", async () => {
    await mountPromotable();
    expect(topline("kind")).toBe("? · not identified");
    expect(q("data-topline", "kind")!.getAttribute("title")).toMatch(/did not name it/);
    cleanup();
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pdn", leaf_source: "title" }));
    await mountPromotable();
    expect(topline("kind")).toBe("PDN · from title");
    expect(q("data-topline", "kind")!.getAttribute("title")).toBe("read from the document's title");
  });

  it("the leaf chip is in the topline kind element", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "declared" }));
    await mountPromotable();
    const kind = q("data-topline", "kind")!;
    expect(kind.querySelector("[data-leaf-chip]")?.getAttribute("data-leaf")).toBe("pcn");
    expect(kind.textContent).toContain("PCN · declared");
    expect(kind.getAttribute("title")).toBe("declared at the drop");
  });

  const statusWire = (over: Record<string, unknown>) => ({
    ingest_id: SHA, sha256: SHA.replace(/^sha256:/, ""), kind: "pdf", stage: "review", detail: null, duplicate: null,
    created_at: 1, updated_at: 1, origin: null, case_id: null, ...over,
  });
  const pickPdn = async () => {
    fireEvent.click(q("data-leaf-verb", "change")!);
    fireEvent.click(q("data-leaf-pick", "pdn")!);
  };

  it("a pick whose response is at review updates the label", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "title" }));
    correctIngestLeaf.mockResolvedValue(statusWire({ stage: "review", leaf: "pdn", leaf_source: "corrected", corrected_by: "ana" }));
    await mountPromotable();
    await pickPdn();
    await waitFor(() => expect(topline("kind")).toBe("PDN · corrected by ana"));
    expect(correctIngestLeaf).toHaveBeenCalledWith(SHA, "pdn");
    expect(document.querySelector("[data-leaf-sent-back]")).toBeNull();
    expect(promoteBtn().disabled).toBe(false);
    expect(rejectBtn().disabled).toBe(false);
  });

  it("a change after parts extraction sends the review back", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "title" }));
    correctIngestLeaf.mockResolvedValue(statusWire({ stage: "extracting", leaf: "pdn", leaf_source: "corrected", corrected_by: "ana" }));
    await mountPromotable();
    await pickPdn();
    await waitFor(() => expect(document.querySelector("[data-leaf-sent-back]")).not.toBeNull());
    expect(hold()).toBe("sent-back");
    expect(document.querySelector("[data-promote-held]")?.textContent).toBe(
      "The kind changed to PDN: the document went back to extraction for the new kind. A new review replaces this one; Promote and Reject are off here.",
    );
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(true);
    expect(q("data-leaf-verb", "change"), "a sent-back task offers no further leaf change").toBeNull();
  });

  const holdText = () => document.querySelector("[data-promote-held]")?.textContent ?? "";
  const replacedBy = () => card().getAttribute("data-review-replaced-by");

  it("a re-class at review supersedes this task: Promote and Reject go off and the new task is named", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "title" }));
    correctIngestLeaf.mockResolvedValue(
      statusWire({ stage: "review", leaf: "pdn", leaf_source: "corrected", corrected_by: "ana", task_id: "document_promotion:x:g1", superseded_task_id: "t-promo" }),
    );
    await mountPromotable();
    await pickPdn();
    await waitFor(() => expect(document.querySelector("[data-leaf-sent-back]")).not.toBeNull());
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(true);
    expect(q("data-leaf-verb", "change"), "chip locked").toBeNull();
    expect(holdText()).toContain("document_promotion:x:g1");
    expect(replacedBy()).toBe("document_promotion:x:g1");
  });

  it("a leaf answer at review that supersedes another task does not hold this card", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "title" }));
    correctIngestLeaf.mockResolvedValue(
      statusWire({ stage: "review", leaf: "pdn", leaf_source: "corrected", corrected_by: "ana", task_id: "document_promotion:x:g1", superseded_task_id: "some-other-task" }),
    );
    await mountPromotable();
    await pickPdn();
    await waitFor(() => expect(topline("kind")).toBe("PDN · corrected by ana"));
    expect(document.querySelector("[data-leaf-sent-back]")).toBeNull();
    expect(promoteBtn().disabled).toBe(false);
    expect(rejectBtn().disabled).toBe(false);
  });

  const staleWire = (new_task_id: string | null) => ({
    response: { status: 409, data: { detail: { error: "stale_extraction", task_id: "t-promo", new_task_id, stage: "review", message: "This review was replaced." } } },
  });
  const tryPromote = async () => {
    await mountPromotable();
    fireEvent.click(promoteBtn());
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).not.toBeNull());
  };

  it("a stale_extraction refusal with a new task holds the card and names it", async () => {
    actOnHumanTask.mockRejectedValue(staleWire("document_promotion:x:g1"));
    await tryPromote();
    expect(document.querySelector("[data-act-refusal]")!.textContent).toContain("This review was replaced.");
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(true);
    expect(holdText()).toBe(
      "This review is stale. Review document_promotion:x:g1 replaces it and appears as its own card; Promote and Reject are off here.",
    );
    expect(replacedBy()).toBe("document_promotion:x:g1");
  });

  it("a stale_extraction refusal with no new task holds the card as re-extracting", async () => {
    actOnHumanTask.mockRejectedValue(staleWire(null));
    await tryPromote();
    expect(promoteBtn().disabled).toBe(true);
    expect(rejectBtn().disabled).toBe(true);
    expect(holdText()).toBe(
      "This review is stale: the document is being extracted again, and a new review will replace this one. Promote and Reject are off here.",
    );
    expect(replacedBy()).toBeNull();
  });

  it("a stale_extraction refusal naming the acted task as new is treated as no new task", async () => {
    actOnHumanTask.mockRejectedValue(staleWire("t-promo"));
    await tryPromote();
    expect(holdText()).toContain("the document is being extracted again");
    expect(replacedBy()).toBeNull();
  });

  it("a 409 that is not stale_extraction holds nothing", async () => {
    actOnHumanTask.mockRejectedValue({ response: { status: 409, data: { detail: { error: "leaf_changed", new_task_id: "document_promotion:x:g1", message: "m" } } } });
    await tryPromote();
    expect(document.querySelector("[data-leaf-sent-back]")).toBeNull();
    expect(replacedBy()).toBeNull();
    expect(promoteBtn().disabled).toBe(false);
    expect(rejectBtn().disabled).toBe(false);
  });

  it.each(["approved", "rejected", "expired"] as const)("a decided task (%s) shows the leaf but offers no change", async (task_state) => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pcn", leaf_source: "title" }));
    await mount(task({ task_state }));
    expect(topline("kind")).toBe("PCN · from title");
    expect(q("data-leaf-verb", "change"), `a ${task_state} task offers no leaf change`).toBeNull();
  });

  it("a recorded decision on this card locks the leaf chip", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    await mountPromotable();
    expect(q("data-leaf-verb", "change")).not.toBeNull();
    fireEvent.click(rejectBtn());
    fireEvent.click(document.querySelector('[data-reject-code="not_a_notice"] input')!);
    fireEvent.click(document.querySelector("[data-reject-confirm]")!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(q("data-leaf-verb", "change"), "the chip still offers a change after the decision").toBeNull());
  });

  it("a leaf with no source says so, on the chip and in the tooltip", async () => {
    fetchIngestExtraction.mockImplementation(async () => ({ ...exBody(), leaf: "pdn", leaf_source: "extraction-title" }));
    await mountPromotable();
    expect(topline("kind")).toBe("PDN · source not given");
    expect(q("data-topline", "kind")!.getAttribute("title")).toBe("source not given");
  });
});

// ── the promotion editor has its own flag ───────────────────────────────────────────────────
describe("the promotion editor flag", () => {
  const setCfg = (v: Record<string, string> | null) => {
    (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = v === null ? undefined : v;
  };
  afterEach(() => setCfg(null));
  const q = (attr: string) => document.querySelector(`[${attr}]`) as HTMLElement | null;

  it("unset: no header fix and no row fix controls", async () => {
    setCfg(null);
    await mountPromotable();
    expect(q("data-header-fix")).toBeNull();
    expect(q("data-row-fix")).toBeNull();
  });
  it("VITE_REVIEW_ROW_EDITS alone: still no editor", async () => {
    setCfg({ VITE_REVIEW_ROW_EDITS: "true" });
    await mountPromotable();
    expect(q("data-header-fix")).toBeNull();
    expect(q("data-row-fix")).toBeNull();
  });
  it("VITE_PROMOTION_ROW_EDITS true: the editor is present", async () => {
    setCfg({ VITE_PROMOTION_ROW_EDITS: "true" });
    await mountPromotable();
    expect(q("data-header-fix")).not.toBeNull();
    expect(q("data-row-fix")).not.toBeNull();
  });
});

describe("PdfEvidencePane with no box", () => {
  const nullTarget = { page: 2, bbox: null, page_dims: { width: 1, height: 1 }, units: null };
  const noBox = () => document.querySelector('[data-evidence-caption="no-box"]');

  it("a null bbox jumps to the page, draws no outline and says no box", async () => {
    render(<PdfEvidencePane ingestId={SHA} target={nullTarget} quality="cell" />);
    await waitFor(() => expect(noBox()).not.toBeNull());
    expect(noBox()!.textContent!.startsWith("on page 2, no box")).toBe(true);
    expect(shownPage()).toBe("2");
    expect(outline()).toBeNull();
  });

  it("the no-box caption wins over a given caption", async () => {
    render(<PdfEvidencePane ingestId={SHA} target={nullTarget} quality="cell" caption="Outlined: the title the read used on p2." />);
    await waitFor(() => expect(noBox()).not.toBeNull());
    expect(document.body.textContent).not.toContain("Outlined: the title");
  });
});

describe("PdfEvidencePane caption", () => {
  const target = { page: 1, bbox: [0.1, 0.2, 0.5, 0.3] as [number, number, number, number], page_dims: { width: 1, height: 1 }, units: null };
  const caption = () => document.querySelector("[data-evidence-caption]")?.textContent;

  it("a caption prop replaces the outline caption's text", async () => {
    render(<PdfEvidencePane ingestId={SHA} target={target} quality="cell" caption="Outlined: the title the read used on p1." />);
    await waitFor(() => expect(caption()).toBe("Outlined: the title the read used on p1."));
  });

  it("without a caption prop the outline caption is the quality's own", async () => {
    render(<PdfEvidencePane ingestId={SHA} target={target} quality="cell" />);
    await waitFor(() => expect(caption()).toBe("Outlined: the cell this row was read from."));
  });
});

describe("the dropper cannot attest its own origin", () => {
  const viewer = (authz_id?: string) =>
    usePersonaStore.setState({ entitlements: { authz_id, email: "x@example.com" } as never });

  it("the dropper sees Promote held with the reason, and Reject open", async () => {
    viewer("alice@example.com");
    await mount();
    expect(promoteBtn().disabled).toBe(true);
    expect(hold()).toBe("dropper");
    expect(document.querySelector("[data-promote-held=\"dropper\"]")!.textContent).toContain("someone else must attest its origin");
    expect(rejectBtn().disabled).toBe(false);
  });

  it("someone who did not drop it can promote", async () => {
    viewer("bob@example.com");
    await mountPromotable();
    expect(hold()).toBeNull();
  });

  it("the dropper's hold does not wait for the rows: it shows while they are still loading", async () => {
    viewer("alice@example.com");
    fetchIngestExtraction.mockReturnValue(new Promise(() => {}));
    render(<ApprovalTaskCard task={task()} />);
    await waitFor(() => expect(document.querySelector('[data-pdf-state="ready"]')).not.toBeNull());
    expect(hold()).toBe("dropper");
    expect(rejectBtn().disabled).toBe(false);
  });

  it("the person it was dropped for sees Promote held", async () => {
    viewer("carol@example.com");
    await mount(task({ payload: payload193({ dropped_by: { authz_id: "svc:bot", on_behalf_of: "carol@example.com" } }) }));
    expect(promoteBtn().disabled).toBe(true);
    expect(hold()).toBe("dropper");
  });

  it("with no authz_id on the entitlements the card does not hold Promote", async () => {
    // The email IS the dropper's id here, so a fallback to the email would hold Promote and fail this arm.
    usePersonaStore.setState({ entitlements: { email: "alice@example.com" } as never });
    await mountPromotable();
    expect(hold()).toBeNull();
  });
});

describe("no declaration served (fail closed, architect 2026-10-30)", () => {
  it("draws no verb button and says so", () => {
    render(<ApprovalTaskCard task={task({ declaration: undefined })} />);
    expect(document.querySelectorAll("[data-verb]")).toHaveLength(0);
    expect(document.querySelector("[data-no-declaration]")?.textContent).toBe(NO_DECLARATION_SERVED);
    expect(screen.queryByRole("button", { name: /^(approved|rejected|promoted)$/i })).toBeNull();
  });
});
