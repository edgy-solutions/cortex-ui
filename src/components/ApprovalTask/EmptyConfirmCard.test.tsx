/**
 * The `document_empty_confirm` card (spec 208): dispatch, the account it shows, the verbs it offers
 * in the declaration's order, the page field, what is POSTED, the honest success sentence per stage,
 * and the inline refusals. The source pane and the promotion card are stubbed: this file is about
 * the decision, and the PDF machinery has its own tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({ actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("./PdfEvidencePane", () => ({
  PdfEvidencePane: (p: { ingestId: string | null; target: unknown }) => (
    <div data-pane-stub data-pane-ingest={p.ingestId ?? ""} data-pane-target={p.target === null ? "none" : "some"} />
  ),
}));
vi.mock("./PromotionReviewCard", () => ({ PromotionReviewCard: () => <div data-promotion-stub /> }));

import { toast } from "sonner";
import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { ADD_MISSED_PART_NOT_BUILT_MESSAGE } from "@/lib/emptyConfirm";

const ING = `sha256:${"ab".repeat(32)}`;
const DECL = {
  kind: "document_empty_confirm",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "EMPTY",
  title: "Confirm a document has no parts",
  accepts: ["confirmed_no_parts", "has_parts"],
  reason_required: [],
};
const PROMO_DECL = { ...DECL, kind: "document_promotion", badge: "PROMOTE", accepts: ["promoted", "rejected"] };

const payload = (over: Record<string, unknown> = {}) => ({
  review_shape: "empty",
  ingest_id: ING,
  attempt: 1,
  source: `/ingest/${ING}/source`,
  account: { n_tables: 2, grid_no_parts_col: 1, grid_rows_emitted: 0, review_reasons: ["table 1 has no part column"], why: "no_parts_column" },
  forced_text_fallback: false,
  add_missed_part: false,
  content_kind: "pcn",
  ...over,
});
const task = (over: Partial<ApprovalTaskPayload> = {}): ApprovalTaskPayload => ({
  task_id: `document_empty_confirm:${ING}:a1`,
  kind: "document_empty_confirm",
  task_state: "pending",
  title: `No parts found in ${ING}`,
  summary: "Confirm the document has none, or say it has parts.",
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: ING,
  declaration: DECL,
  payload: payload(),
  ...over,
});

beforeEach(() => {
  actOnHumanTask.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});
afterEach(cleanup);

const verbs = () => [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));
const hasParts = () => document.querySelector('[data-verb="has_parts"]') as HTMLButtonElement;
const noParts = () => document.querySelector('[data-verb="confirmed_no_parts"]') as HTMLButtonElement;
const pageInput = () => document.querySelector("[data-page-input]") as HTMLInputElement;
const figure = (k: string) => document.querySelector(`[data-figure="${k}"]`)?.textContent;
const setPage = (v: string) => fireEvent.change(pageInput(), { target: { value: v } });

describe("dispatch", () => {
  it("the kind plus review_shape 'empty' draws this card, with the source for the ingest and no box", () => {
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-empty-confirm]")).toBeTruthy();
    expect(document.querySelector("[data-pane-stub]")?.getAttribute("data-pane-ingest")).toBe(ING);
    expect(document.querySelector("[data-pane-stub]")?.getAttribute("data-pane-target")).toBe("none");
  });
  it("the same kind without review_shape 'empty' draws the generic card", () => {
    render(<ApprovalTaskCard task={task({ payload: payload({ review_shape: undefined }) })} />);
    expect(document.querySelector("[data-empty-confirm]")).toBeNull();
    expect(verbs()).toEqual(["confirmed_no_parts", "has_parts"]);
    expect(document.querySelector("[data-page-input]")).toBeNull();
  });
  it("document_promotion still draws the promotion card", () => {
    render(<ApprovalTaskCard task={task({ kind: "document_promotion", declaration: PROMO_DECL, payload: { ingest_id: ING } })} />);
    expect(document.querySelector("[data-promotion-stub]")).toBeTruthy();
    expect(document.querySelector("[data-empty-confirm]")).toBeNull();
  });
});

describe("the account", () => {
  it("shows the why sentence, the three figures and the review reasons", () => {
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-empty-why]")?.textContent).toBe("Tables were found, but none has a part-number column.");
    expect([figure("n_tables"), figure("grid_no_parts_col"), figure("grid_rows_emitted")]).toEqual(["2", "1", "0"]);
    expect(screen.getByText("Tables found")).toBeTruthy();
    expect(screen.getByText("Tables with no part-number column")).toBeTruthy();
    expect(screen.getByText("Rows emitted")).toBeTruthy();
    expect(document.querySelector("[data-empty-reasons]")?.textContent).toContain("table 1 has no part column");
  });
  it("a null figure reads 'not reported', never 0; no reasons draws no list; an unknown why is shown", () => {
    const acct = { n_tables: null, grid_no_parts_col: null, grid_rows_emitted: null, review_reasons: [], why: "scanned_blank" };
    render(<ApprovalTaskCard task={task({ payload: payload({ account: acct }) })} />);
    expect([figure("n_tables"), figure("grid_no_parts_col"), figure("grid_rows_emitted")]).toEqual(["not reported", "not reported", "not reported"]);
    expect(document.querySelector("[data-empty-reasons]")).toBeNull();
    expect(document.querySelector("[data-empty-why]")?.textContent).toBe("The extraction says: scanned_blank");
  });
  it("notes a forced text fallback only when one was used", () => {
    const { unmount } = render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-empty-forced-fallback]")).toBeNull();
    unmount();
    render(<ApprovalTaskCard task={task({ payload: payload({ forced_text_fallback: true }) })} />);
    expect(document.querySelector("[data-empty-forced-fallback]")?.textContent).toBe("Forced text fallback was already used");
  });
});

describe("the verbs", () => {
  it("are the declaration's, in its order, with the two known wordings", () => {
    render(<ApprovalTaskCard task={task({ declaration: { ...DECL, accepts: ["has_parts", "confirmed_no_parts", "dismissed"] } })} />);
    expect(verbs()).toEqual(["has_parts", "confirmed_no_parts", "dismissed"]);
    expect(noParts().textContent).toContain("No parts in this document");
    expect(document.querySelector('[data-verb="dismissed"]')?.textContent).toBe("Dismissed");
  });
  it("has_parts needs an integer page >= 1", () => {
    render(<ApprovalTaskCard task={task()} />);
    expect(pageInput().min).toBe("1");
    expect(pageInput().required).toBe(true);
    expect(hasParts().disabled).toBe(true);
    expect(hasParts().textContent).toBe("It has parts — page N");
    for (const bad of ["0", "-2", "1.5", "abc", ""]) {
      setPage(bad);
      expect(hasParts().disabled, `page ${JSON.stringify(bad)}`).toBe(true);
    }
    setPage("3");
    expect(hasParts().disabled).toBe(false);
    expect(hasParts().textContent).toBe("It has parts — page 3");
    expect(noParts().disabled).toBe(false);
  });
  it("add_missed_part disables has_parts and shows the producer's sentence; confirmed_no_parts stays enabled", () => {
    render(<ApprovalTaskCard task={task({ payload: payload({ add_missed_part: true }) })} />);
    setPage("3");
    expect(hasParts().disabled).toBe(true);
    expect(noParts().disabled).toBe(false);
    expect(document.querySelector("[data-add-missed-part-message]")?.textContent).toBe(ADD_MISSED_PART_NOT_BUILT_MESSAGE);
    const add = screen.getByRole("button", { name: "Add a missed part" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });
  it("without add_missed_part there is no such button or sentence", () => {
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-add-missed-part]")).toBeNull();
  });
  it("audience document_promotion:SUSTAINMENT with a served menu declaring both kinds still shows the buttons", () => {
    useTaskKindStore.setState({ status: "loaded", byKind: { document_empty_confirm: { ...DECL, reasonRequired: new Set<string>() } as never, document_promotion: { ...PROMO_DECL, reasonRequired: new Set<string>() } as never } });
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-kind-contradiction]")).toBeNull();
    expect(verbs()).toEqual(["confirmed_no_parts", "has_parts"]);
  });
});

describe("what is posted, and what is claimed", () => {
  it("has_parts posts the page as the 8th argument, with the shared three leading ones", async () => {
    actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "has_parts", stage: "received", attempt: 2, extraction_defect: "extraction_defect:x", force_text_fallback: true });
    render(<ApprovalTaskCard task={task()} />);
    setPage("3");
    fireEvent.click(hasParts());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0]).toEqual([task().task_id, "has_parts", "", undefined, undefined, undefined, undefined, undefined, 3]);
    const sentence = "Sent back for re-extraction with the text fallback (attempt 2) — filed as extraction_defect:x";
    await waitFor(() => expect(document.querySelector("[data-act-outcome]")?.textContent).toBe(sentence));
    expect(document.querySelector("[data-act-outcome]")?.textContent).not.toContain("workflow not resumed");
    expect(toast.success).toHaveBeenCalledWith(sentence);
  });
  it("confirmed_no_parts posts NO page", async () => {
    actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "confirmed_no_parts", stage: "no_parts" });
    render(<ApprovalTaskCard task={task()} />);
    setPage("3");
    fireEvent.click(noParts());
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0]).toEqual([task().task_id, "confirmed_no_parts", ""]);
    await waitFor(() => expect(document.querySelector("[data-act-outcome]")?.textContent).toBe("Confirmed: no parts in this document"));
    expect(toast.success).toHaveBeenCalledWith("Confirmed: no parts in this document");
  });
  it("any other stage reads '<verb> — now <stage>'", async () => {
    actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "confirmed_no_parts", stage: "review" });
    render(<ApprovalTaskCard task={task()} />);
    fireEvent.click(noParts());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Confirmed no parts — now review"));
  });
  it("a result with no stage keeps the generic wording", async () => {
    actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "confirmed_no_parts" });
    render(<ApprovalTaskCard task={task()} />);
    fireEvent.click(noParts());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Recorded: Confirmed no parts — workflow not resumed"));
  });
});

describe("refusals are drawn inline, and never retried", () => {
  const refuse = (status: number, detail: unknown) => actOnHumanTask.mockRejectedValue({ response: { status, data: { detail } } });
  it.each([
    [409, { error: "no_open_empty_task", stage: "promoted", task_id: "t", message: "that ingest has no open empty-confirm task" }],
    [409, { error: "add_missed_part_not_built", message: ADD_MISSED_PART_NOT_BUILT_MESSAGE }],
    [422, { error: "page_required", message: "has_parts needs the page the parts are on" }],
  ])("%s %j", async (status, detail) => {
    refuse(status as number, detail);
    render(<ApprovalTaskCard task={task()} />);
    setPage("3");
    fireEvent.click(hasParts());
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")).toBeTruthy());
    expect(document.querySelector("[data-act-refusal]")?.textContent).toContain((detail as { message: string }).message);
    expect(actOnHumanTask).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    // the card is still decidable
    expect(hasParts().disabled).toBe(false);
  });
});
