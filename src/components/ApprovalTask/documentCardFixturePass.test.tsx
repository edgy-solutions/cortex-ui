/**
 * THE DOCUMENT CARD, DRIVEN BY A sections[] PAYLOAD THROUGH THE REAL PATH.
 *
 * Everything between the payload and the wire is real: `ApprovalTaskCard` -> `readDocumentReviewTask`
 * -> `useReviewShapes` (only the `GET /review-shapes` transport is mocked, served from
 * `REVIEW_SHAPES_FIXTURE`) -> `DocumentReviewCard` -> `useTaskAct` -> the real `buildActBody`. Only the
 * pane and the HTTP act are stood in for. PROPOSED payload names (`documentReview.ts` is their one home):
 * a producer that serves other names changes that file and the fixture, and these arms say what broke.
 *
 * What this pins that `DocumentReviewCard.test.tsx` does not: the card is chosen by the SERVED list, a
 * payload with no `header` draws, a payload that claims the shape and cannot be read says so instead of
 * falling through silently, and the coverage body is exactly the served row's, not a constant's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/api/client")>("@/api/client")),
  actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a),
}));
const fetchReviewShapes = vi.fn();
vi.mock("@/lib/ingestTransport", async () => ({
  ...(await vi.importActual<typeof import("@/lib/ingestTransport")>("@/lib/ingestTransport")),
  fetchReviewShapes: (...a: unknown[]) => fetchReviewShapes(...a),
  fetchIngestSource: vi.fn(() => new Promise(() => {})),
  fetchIngestExtraction: vi.fn(() => new Promise(() => {})),
  correctIngestLeaf: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("./PdfEvidencePane", () => ({ PdfEvidencePane: () => <div data-pane-stub /> }));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { resetReviewShapesCache } from "./useReviewShapes";
import { buildActBody } from "@/api/client";
import { REVIEW_SHAPES_FIXTURE } from "@/lib/reviewShapesFixture";
import {
  fixtureDocumentReviewDuplicate,
  fixtureDocumentReviewPayload,
} from "@/lib/documentReviewFixture";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";

const DECL = {
  kind: "document_promotion",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "PROMOTE",
  title: "Contributed document",
  accepts: ["promoted", "rejected"],
  reason_required: ["rejected"],
};
const task = (payload: Record<string, unknown>): ApprovalTaskPayload => ({
  task_id: "t-doc",
  kind: "document_promotion",
  task_state: "pending",
  title: "Review the work instruction",
  summary: "",
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: null,
  declaration: DECL,
  payload,
});

beforeEach(() => {
  actOnHumanTask.mockReset().mockResolvedValue({ workflow_resumed: true });
  fetchReviewShapes.mockReset().mockResolvedValue(REVIEW_SHAPES_FIXTURE);
  resetReviewShapesCache();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
});
afterEach(cleanup);

/** The /act body the call put on the wire: actOnHumanTask's positional args through the real buildActBody. */
const sentBody = () => {
  const [, decision, comment, overrides, rowEdits, reasonCode, headerEdits, page, coverage] = actOnHumanTask.mock.calls[0] as Parameters<
    typeof import("@/api/client").actOnHumanTask
  >;
  return buildActBody(decision, comment, overrides, rowEdits, reasonCode, headerEdits, page, coverage);
};

const q = (sel: string) => document.querySelector(sel);
const row = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const rows = () => [...document.querySelectorAll("[data-section-id]")] as HTMLElement[];
const accept = (id: string) => fireEvent.click(row(id).querySelector("[data-accept]")!);
const flag = (id: string) => fireEvent.click(row(id).querySelector("[data-flag]")!);
const verb = (v: string) => q(`[data-submit-decision="${v}"]`) as HTMLButtonElement;
const acceptAll = () => ["s1", "s2", "s3", "s4", "s5"].forEach(accept);
const refused = () => q("[data-document-card-refused]")?.textContent ?? null;

/** Draw the card through the real path and wait for the served list to resolve it. */
async function drawCard(payload: Record<string, unknown>) {
  render(<ApprovalTaskCard task={task(payload)} />);
  await waitFor(() => expect(q("[data-document-review]")).not.toBeNull());
}
/** Draw a task that must NOT draw the document card; settle the effects first. */
async function drawNoCard(payload: Record<string, unknown>) {
  render(<ApprovalTaskCard task={task(payload)} />);
  await act0();
  expect(q("[data-document-review]")).toBeNull();
}
const act0 = () => new Promise((r) => setTimeout(r, 0));

describe("the document card, through the served list and the real act path", () => {
  it("a) no header key at all: the card draws with no 'undefined' or 'null' text, and a promote sends exactly the served row's coverage", async () => {
    const payload = fixtureDocumentReviewPayload();
    delete payload.header;
    expect("header" in payload).toBe(false);
    await drawCard(payload);
    expect(document.body.textContent).not.toMatch(/undefined|null/);
    acceptAll();
    fireEvent.click(verb("promoted"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(body.review_coverage).toEqual({
      review_shape: "document",
      item_kind: "section",
      rules_version: "document.v1",
      looked_at: ["s1", "s2", "s3", "s4", "s5"],
      flagged: [],
      sampled: [],
      groups: [],
      shared: [],
      sample: null,
    });
    expect("section_verdicts" in body).toBe(false);
  });

  it("b) a flagged section with a note: promoted disabled, rejected enabled, and rejecting sends no coverage and a reason naming the id and note", async () => {
    await drawCard(fixtureDocumentReviewPayload());
    acceptAll();
    flag("s3");
    fireEvent.change(screen.getByLabelText("Note for Removal procedure"), { target: { value: "step 4 missing" } });
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(false);
    fireEvent.click(verb("rejected"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    const body = sentBody();
    expect(Object.hasOwn(body, "review_coverage")).toBe(false);
    expect(body.comment).toContain("s3");
    expect(body.comment).toContain("step 4 missing");
  });

  it("c) four of five reviewed: neither verb acts", async () => {
    await drawCard(fixtureDocumentReviewPayload());
    ["s1", "s2", "s3", "s4"].forEach(accept);
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(true);
    fireEvent.click(verb("promoted"));
    fireEvent.click(verb("rejected"));
    await act0();
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("d) page_end absent, null, equal to page, below page, and valid: only the valid one draws a range", async () => {
    const sections = [
      { section_id: "s1", title: "Absent", page: 2 },
      { section_id: "s2", title: "Null", page: 3, page_end: null },
      { section_id: "s3", title: "Equal", page: 4, page_end: 4 },
      { section_id: "s4", title: "Below", page: 6, page_end: 5 },
      { section_id: "s5", title: "Valid", page: 7, page_end: 9 },
    ];
    await drawCard(fixtureDocumentReviewPayload({ sections }));
    expect(row("s1").textContent).toContain("p. 2");
    expect(row("s2").textContent).toContain("p. 3");
    expect(row("s3").textContent).toContain("p. 4");
    expect(row("s4").textContent).toContain("p. 6");
    for (const id of ["s1", "s2", "s3", "s4"]) expect(row(id).textContent, id).not.toContain("pp.");
    expect(row("s5").textContent).toContain("pp. 7–9");
    expect(document.body.textContent).not.toMatch(/undefined|null/);
  });

  it("e) one numeric section_id is dropped and blocks the submit; all numeric is refused and the generic card draws", async () => {
    const sections = fixtureDocumentReviewPayload().sections as Record<string, unknown>[];
    await drawCard(fixtureDocumentReviewPayload({ sections: sections.map((s, i) => (i === 1 ? { ...s, section_id: 2 } : s)) }));
    expect(rows()).toHaveLength(4);
    ["s1", "s3", "s4", "s5"].forEach(accept);
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(true);
    expect(q("[data-dropped-sections]")).not.toBeNull();
    cleanup();

    const allNumeric = sections.map((s, i) => ({ ...s, section_id: i + 1 }));
    await drawNoCard(fixtureDocumentReviewPayload({ sections: allNumeric }));
    expect(refused()).toContain("The section review card is not drawn:");
    expect(refused()).toContain("no section was well-formed");
    expect(document.body.textContent).toContain("Document promotion");
  });

  it.each([
    ["no sections key", () => { const p = fixtureDocumentReviewPayload(); delete p.sections; return p; }, "sections is not a non-empty array"],
    ["sections: []", () => fixtureDocumentReviewPayload({ sections: [] }), "sections is not a non-empty array"],
    ["no ingest_id", () => { const p = fixtureDocumentReviewPayload(); delete p.ingest_id; return p; }, "ingest_id is missing"],
  ])("f) review_shape document with %s: the refused line gives the reason, no document card", async (_n, make, why) => {
    await drawNoCard(make());
    expect(refused()).toBe(`The section review card is not drawn: ${why}.`);
  });

  it("g) duplicate section ids: the refused line names the duplicate", async () => {
    await drawNoCard(fixtureDocumentReviewDuplicate());
    expect(refused()).toContain("duplicate section_id");
  });

  it.each([
    ["review_shape notice carrying a sections array", () => fixtureDocumentReviewPayload({ review_shape: "notice" })],
    ["no review_shape at all", () => { const p = fixtureDocumentReviewPayload(); delete p.review_shape; return p; }],
  ])("h) wrong card, %s: no document card, NO refused line", async (_n, make) => {
    await drawNoCard(make());
    expect(q("[data-document-card-refused]")).toBeNull();
  });

  it("i) ids are sent verbatim: a numeric-looking string and one with surrounding spaces", async () => {
    const sections = [
      { section_id: "7", title: "Seven", page: 1 },
      { section_id: " s1 ", title: "Padded", page: 2 },
    ];
    await drawCard(fixtureDocumentReviewPayload({ sections }));
    const byId = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
    fireEvent.click(byId("7").querySelector("[data-accept]")!);
    fireEvent.click(byId(" s1 ").querySelector("[data-accept]")!);
    fireEvent.click(verb("promoted"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect((sentBody().review_coverage as { looked_at: string[] }).looked_at).toEqual(["7", " s1 "]);
  });

  it("j) a served row with rules_version document.v2 is what the body sends, not a constant", async () => {
    fetchReviewShapes.mockResolvedValue(
      REVIEW_SHAPES_FIXTURE.map((r) => (r.review_shape === "document" ? { ...r, rules_version: "document.v2" } : r)),
    );
    await drawCard(fixtureDocumentReviewPayload());
    acceptAll();
    fireEvent.click(verb("promoted"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    const cov = sentBody().review_coverage as { rules_version: string };
    expect(cov.rules_version).toBe("document.v2");
  });
});
