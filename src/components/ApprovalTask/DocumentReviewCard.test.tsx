/**
 * The document review card (PROPOSED shape; see src/lib/documentReview.ts). The pane is stood in for:
 * what is sealed is WHICH page it is told to show, and what the card sends at the act.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NO_DECLARATION_SERVED, verbLabel } from "@/lib/taskDeclaration";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({ actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("@/lib/ingestTransport", () => ({
  correctIngestLeaf: vi.fn(),
  fetchIngestSource: vi.fn(() => new Promise(() => {})),
  fetchIngestExtraction: vi.fn(() => new Promise(() => {})),
}));
const paneProps = vi.fn();
vi.mock("./PdfEvidencePane", () => ({
  PdfEvidencePane: (p: Record<string, unknown>) => {
    paneProps(p);
    return <div data-pane-stub />;
  },
}));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { fixtureDocumentReviewMalformed, fixtureDocumentReviewPayload, FIXTURE_DOCUMENT_INGEST_ID } from "@/lib/documentReviewFixture";
import { fixturePromotionPayload } from "@/lib/promotionReviewFixture";

const DECL = {
  kind: "document_promotion",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "PROMOTE",
  title: "Contributed document",
  accepts: ["promoted", "rejected"],
  reason_required: ["rejected"],
};
const task = (payload: Record<string, unknown>, declaration: Record<string, unknown> = DECL): ApprovalTaskPayload => ({
  task_id: "t-doc",
  kind: "document_promotion",
  task_state: "pending",
  title: "Review the work instruction",
  summary: "",
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: null,
  declaration,
  payload,
});

beforeEach(() => {
  actOnHumanTask.mockReset().mockResolvedValue({ workflow_resumed: true });
  paneProps.mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
});
afterEach(cleanup);

const rows = () => [...document.querySelectorAll("[data-section-id]")] as HTMLElement[];
const row = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const accept = (id: string) => fireEvent.click(row(id).querySelector("[data-accept]")!);
const flag = (id: string) => fireEvent.click(row(id).querySelector("[data-flag]")!);
const verb = (v: string) => document.querySelector(`[data-submit-decision="${v}"]`) as HTMLButtonElement;
const verbOrder = () => [...document.querySelectorAll("[data-submit-decision]")].map((b) => b.getAttribute("data-submit-decision"));
const lastProps = () => paneProps.mock.calls.at(-1)![0] as { target: { page: number }; jumpKey: number; ingestId: string };
const acceptAll = () => ["s1", "s2", "s3", "s4", "s5"].forEach(accept);

describe("DocumentReviewCard", () => {
  it("renders a row per section, the header, and reads a null field as not stated", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    expect(rows().map((r) => r.getAttribute("data-section-id"))).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(row("s3").textContent).toContain("pp. 3–4");
    expect(row("s1").textContent).toContain("p. 1");
    expect(document.querySelector('[data-header-field="revision"]')!.textContent).toBe("not stated");
    expect(document.querySelector('[data-header-field="doc id"]')!.textContent).toBe("WI-2231");
  });

  it("clicking a row moves the pane target page and marks that row selected", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    expect(lastProps().target.page).toBe(1);
    expect(lastProps().ingestId).toBe(FIXTURE_DOCUMENT_INGEST_ID);
    fireEvent.click(row("s4"));
    expect(lastProps().target.page).toBe(5);
    expect(document.querySelectorAll("[data-selected]")).toHaveLength(1);
    expect(row("s4").hasAttribute("data-selected")).toBe(true);
    fireEvent.click(row("s5"));
    expect(lastProps().target.page).toBe(7);
  });

  it("bumps jumpKey on every click, including the row already selected", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    const k0 = lastProps().jumpKey;
    fireEvent.click(row("s1"));
    expect(lastProps().jumpKey).toBe(k0 + 1);
  });

  it("keeps EVERY served verb disabled until every section has a verdict, and counts them", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(true);
    expect(document.querySelector("[data-review-counter]")!.textContent).toBe("0 of 5 sections reviewed · 0 flagged");
    ["s1", "s2", "s3", "s4"].forEach(accept);
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(true);
    expect(document.querySelector("[data-review-counter]")!.textContent).toBe("4 of 5 sections reviewed · 0 flagged");
    accept("s5");
    expect(verb("promoted").disabled).toBe(false);
    expect(verb("promoted").textContent).toBe(verbLabel("promoted"));
  });

  it("enables the reason-required verb only with flags, and the other only without", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    acceptAll();
    expect(verb("promoted").disabled).toBe(false);
    expect(verb("rejected").disabled).toBe(true);
    flag("s2");
    flag("s4");
    expect(verb("rejected").disabled).toBe(false);
    expect(verb("promoted").disabled).toBe(true);
    expect(document.querySelector("[data-review-counter]")!.textContent).toBe("5 of 5 sections reviewed · 2 flagged");
    expect(row("s2").getAttribute("data-verdict")).toBe("flagged");
    expect(row("s1").getAttribute("data-verdict")).toBe("accepted");
  });

  it("sends the hand-computed body for a promote", async () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    acceptAll();
    fireEvent.click(verb("promoted"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0]).toEqual([
      "t-doc",
      "promoted",
      "",
      undefined,
      undefined,
      undefined,
      undefined,
      [
        { section_id: "s1", verdict: "accepted" },
        { section_id: "s2", verdict: "accepted" },
        { section_id: "s3", verdict: "accepted" },
        { section_id: "s4", verdict: "accepted" },
        { section_id: "s5", verdict: "accepted" },
      ],
    ]);
  });

  it("sends a verdict for EVERY section on a reject, a note only where typed, and a reason", async () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    acceptAll();
    flag("s3");
    fireEvent.change(screen.getByLabelText("Note for Removal procedure"), { target: { value: "step 4 missing" } });
    flag("s5");
    fireEvent.click(verb("rejected"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0]).toEqual([
      "t-doc",
      "rejected",
      "sections flagged: s3, s5",
      undefined,
      undefined,
      undefined,
      undefined,
      [
        { section_id: "s1", verdict: "accepted" },
        { section_id: "s2", verdict: "accepted" },
        { section_id: "s3", verdict: "flagged", note: "step 4 missing" },
        { section_id: "s4", verdict: "accepted" },
        { section_id: "s5", verdict: "flagged" },
      ],
    ]);
  });

  it("blocks the submit when sections were dropped, and says so", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewMalformed())} />);
    expect(rows()).toHaveLength(4);
    ["s1", "s3", "s4", "s5"].forEach(accept);
    expect(document.querySelector("[data-review-counter]")!.textContent).toBe("4 of 4 sections reviewed · 0 flagged");
    expect(verb("promoted").disabled).toBe(true);
    expect(verb("rejected").disabled).toBe(true);
    expect(document.querySelector("[data-dropped-sections]")!.textContent).toBe(
      "1 section(s) in this task were malformed and are not shown — the review cannot be submitted",
    );
  });

  it("draws a refusal with a message inline", async () => {
    actOnHumanTask.mockRejectedValue({ response: { status: 409, data: { detail: { error: "task_unresumable", message: "could not resume" } } } });
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    acceptAll();
    fireEvent.click(verb("promoted"));
    await waitFor(() => expect(document.querySelector("[data-act-refusal]")!.textContent).toContain("could not resume"));
  });
});

describe("the buttons are the served declaration", () => {
  const decl = (accepts: string[], reason_required: string[]) => ({ ...DECL, accepts, reason_required });

  it("renders the verbs in served order, never sorted", () => {
    const { unmount } = render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload(), decl(["rejected", "promoted"], ["rejected"]))} />);
    expect(verbOrder()).toEqual(["rejected", "promoted"]);
    unmount();
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload(), decl(["promoted", "rejected"], ["rejected"]))} />);
    expect(verbOrder()).toEqual(["promoted", "rejected"]);
  });

  it("draws a third served verb with no code change, and sends it with an empty reason", async () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload(), decl(["promoted", "rejected", "deferred"], ["rejected"]))} />);
    expect(verbOrder()).toEqual(["promoted", "rejected", "deferred"]);
    expect(verb("deferred").textContent).toBe(verbLabel("deferred"));
    acceptAll();
    expect(verb("deferred").disabled).toBe(false);
    fireEvent.click(verb("deferred"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0].slice(0, 3)).toEqual(["t-doc", "deferred", ""]);
    expect(actOnHumanTask.mock.calls[0][7]).toEqual(["s1", "s2", "s3", "s4", "s5"].map((id) => ({ section_id: id, verdict: "accepted" })));
  });

  it("pairs by reason_required, not by name: a differently named reason-required verb", async () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload(), decl(["accept", "send_back"], ["send_back"]))} />);
    acceptAll();
    expect(verb("send_back").disabled).toBe(true);
    expect(verb("accept").disabled).toBe(false);
    flag("s2");
    expect(verb("send_back").disabled).toBe(false);
    expect(verb("accept").disabled).toBe(true);
    fireEvent.click(verb("send_back"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledTimes(1));
    expect(actOnHumanTask.mock.calls[0].slice(0, 3)).toEqual(["t-doc", "send_back", "sections flagged: s2"]);
  });
});

describe("the dispatcher", () => {
  it("draws the document card for a document task", () => {
    render(<ApprovalTaskCard task={task(fixtureDocumentReviewPayload())} />);
    expect(document.querySelector("[data-document-review]")).not.toBeNull();
    expect(document.querySelector("[data-promotion-review]")).toBeNull();
  });

  it("still draws the promotion card for a promotion task", () => {
    const sha = `sha256:${"5b15f205".padEnd(64, "a")}`;
    render(<ApprovalTaskCard task={task({ ...fixturePromotionPayload(sha), domain: "SUSTAINMENT" })} />);
    expect(document.querySelector("[data-promotion-review]")).not.toBeNull();
    expect(document.querySelector("[data-document-review]")).toBeNull();
  });
});

describe("no declaration served (fail closed, architect 2026-10-30)", () => {
  it("draws no verb button and says so", () => {
    render(<ApprovalTaskCard task={{ ...task(fixtureDocumentReviewPayload()), declaration: undefined }} />);
    expect(document.querySelectorAll("[data-verb]")).toHaveLength(0);
    expect(document.querySelector("[data-no-declaration]")?.textContent).toBe(NO_DECLARATION_SERVED);
    expect(screen.queryByRole("button", { name: /^(approved|rejected|promoted)$/i })).toBeNull();
  });
});
