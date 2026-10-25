import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { SeededCard } from "./ingestCardTestKit";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskArtifactId } from "@/lib/taskArtifact";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { promotionIngestId, INGEST_STAGES, type IngestStatusRow } from "@/lib/ingestWire";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";

const fetchIngestStatus = vi.fn();
const retryIngest = vi.fn();
const correctIngestLeaf = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  retryIngest: (...args: unknown[]) => retryIngest(...args),
  fetchIngestStatus: (...args: unknown[]) => fetchIngestStatus(...args),
  correctIngestLeaf: (...args: unknown[]) => correctIngestLeaf(...args),
}));

const actOnHumanTask = vi.fn().mockResolvedValue({ task_id: "t", decision: "promoted" });
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...args: unknown[]) => actOnHumanTask(...args),
}));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  retryIngest.mockReset();
  correctIngestLeaf.mockReset();
  useIngestStatusStore.getState().reset();
  actOnHumanTask.mockReset();
  actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "promoted" });
  useHumanTaskStore.setState({ tasks: [] });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

const SHA = "3f9a2b".padEnd(64, "0");
const INGEST_ID = `sha256:${SHA}`;
const OTHER_SHA = "a1b2c3".padEnd(64, "0");
const OTHER_INGEST_ID = `sha256:${OTHER_SHA}`;

const row = (over: Partial<IngestStatusRow> = {}): IngestStatusRow => ({
  ingest_id: INGEST_ID,
  sha256: SHA,
  kind: "pdf",
  stage: "extracting",
  detail: null,
  duplicate: null,
  created_at: 1790860800000,
  updated_at: 1790860800000,
  case_id: null,
  ...over,
});

const promotionTask = (r: IngestStatusRow, over: Partial<HumanTask> = {}): HumanTask => ({
  id: "row-1",
  taskId: "task-9",
  workflowId: null,
  audience: "promotion:DATA_ENGINEERING",
  kind: "document_promotion",
  status: "pending",
  title: "Promote or reject",
  summary: r.ingest_id,
  requestedBy: "bob",
  subjectRef: r.ingest_id,
  payload: { ingest_id: promotionIngestId(r) },
  createdAt: 0,
  ...over,
});

describe("IngestStatusCard — keyed by row.ingest_id", () => {
  it("draws the stage ladder, and the card is keyed by row.ingest_id", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={row()} />);
    expect(document.querySelector(`[data-ingest-id="${INGEST_ID}"]`)).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="received"][data-ingest-ladder-state="done"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="extracting"][data-ingest-ladder-state="current"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"][data-ingest-ladder-state="pending"]')).toBeTruthy();
  });

  it("shows the ingest_id as the header text", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={row()} />);
    expect(screen.getByText(INGEST_ID)).toBeTruthy();
  });

  it("draws NO ladder for a duplicate row, but draws the message and of_ingest_id", () => {
    render(
      <SeededCard
        ingestId={INGEST_ID}
        seed={row({
          stage: null,
          duplicate: {
            of_ingest_id: OTHER_INGEST_ID,
            message: "already processed on 2026-09-29 from work-instruction.pdf",
          },
        })}
       
      />,
    );
    expect(document.querySelector("[data-ingest-ladder]")).toBeNull();
    const dup = document.querySelector("[data-ingest-duplicate]");
    expect(dup?.textContent).toMatch(/already processed/);
    expect(dup?.textContent).toMatch(new RegExp(OTHER_INGEST_ID));
  });

  it("a duplicate whose original IS visible names the original's stage", () => {
    render(
      <SeededCard
        ingestId={INGEST_ID}
        seed={row({
          stage: "review",
          duplicate: { of_ingest_id: OTHER_INGEST_ID, message: "already processed" },
        })}
       
      />,
    );
    expect(document.querySelector("[data-ingest-duplicate]")?.textContent).toMatch(/review/);
  });

  it("rejected is drawn as a terminal branch off review, not past promoted, and draws detail", () => {
    render(
      <SeededCard
        ingestId={INGEST_ID}
        seed={row({ stage: "rejected", detail: "not the right document" })}
       
      />,
    );
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state")).toBe("pending");
    expect(document.querySelector('[data-ingest-ladder-stage="rejected"]')?.getAttribute("data-ingest-ladder-state")).toBe("current");
    expect(screen.getByText(/not the right document/)).toBeTruthy();
  });

  it("failed draws detail too, with only received marked done", () => {
    render(
      <SeededCard
        ingestId={INGEST_ID}
        seed={row({ stage: "failed", detail: "extraction crashed" })}
       
      />,
    );
    expect(document.querySelector('[data-ingest-ladder-stage="received"]')?.getAttribute("data-ingest-ladder-state")).toBe("done");
    expect(document.querySelector('[data-ingest-ladder-stage="extracting"]')?.getAttribute("data-ingest-ladder-state")).toBe("pending");
    expect(screen.getByText(/extraction crashed/)).toBeTruthy();
  });

  it("no matching task renders 'no review task visible to you'", () => {
    render(
      <SeededCard
        ingestId={INGEST_ID}
        seed={row({ stage: "review" })}
       
      />,
    );
    expect(document.querySelector("[data-ingest-no-review-task]")?.textContent).toMatch(/no review task visible to you/);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(0);
  });

  it("a matching pending document_promotion task renders its verbs — THE BRIDGE IS GONE, ingest_id is read as-is", () => {
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(2);
    expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-verb="rejected"]')).toBeTruthy();
  });

  it("Open review foregrounds the task artifact; the defect line opens its task by row id or task id", () => {
    const r = { ...row({ stage: "promoted" }), extraction_defect: { task_id: "task-9", edits: 3 } };
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    const { unmount } = render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    expect(document.querySelector("[data-ingest-extraction-defect]")?.textContent).toContain("3 rows");
    fireEvent.click(document.querySelector("[data-ingest-extraction-defect-open]")!);
    expect(useCanvasStore.getState().currentArtifactId).toBe(taskArtifactId("row-1"));
    unmount();
    const r2 = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r2, { id: "row-2" })] });
    render(<SeededCard ingestId={r2.ingest_id} seed={r2} />);
    fireEvent.click(document.querySelector("[data-ingest-open-review]")!);
    expect(useCanvasStore.getState().currentArtifactId).toBe(taskArtifactId("row-2"));
  });

  it("a payload naming a different ingest_id does NOT match", () => {
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({
      tasks: [promotionTask(r, { payload: { ingest_id: OTHER_INGEST_ID } })],
    });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    expect(document.querySelector("[data-ingest-no-review-task]")).toBeTruthy();
  });

  it("the rejected button is disabled without a comment, and enables once one is typed", () => {
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    const rejectBtn = document.querySelector('[data-ingest-verb="rejected"]') as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);
    fireEvent.change(document.querySelector("[data-ingest-reason-input]")!, { target: { value: "wrong document" } });
    expect(rejectBtn.disabled).toBe(false);
    // promoted never requires a reason
    expect((document.querySelector('[data-ingest-verb="promoted"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking promoted calls actOnHumanTask(task.taskId, 'promoted', '')", async () => {
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("task-9", "promoted", ""));
  });

  it("an act refusal is drawn with data-ingest-act-refusal, names the error and the ingest_id, and renders NO 'done' state", async () => {
    actOnHumanTask.mockReset();
    actOnHumanTask.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { error: "ingest_node_absent", task_id: "task-9", message: "ingest node absent. Nothing was written." } },
      },
    });
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-act-error]")?.getAttribute("data-ingest-act-refusal")).toBe(
        "ingest_node_absent",
      ),
    );
    const text = document.querySelector("[data-ingest-act-error]")?.textContent ?? "";
    expect(text).toMatch(/Refused \(ingest_node_absent\): ingest node absent\. Nothing was written\./);
    expect(text).toMatch(new RegExp(INGEST_ID));
    // still offered — never rendered as resolved
    expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
    expect(document.querySelector("[data-ingest-no-review-task]")).toBeNull();
  });

  it("verbs come from the SERVED document_promotion declaration when the app has one", () => {
    const decl = readTaskDeclaration({
      kind: "document_promotion",
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "PROMOTE",
      title: "Document promotion",
      accepts: ["rejected", "promoted"], // deliberately non-fallback order
      reason_required: ["rejected"],
    });
    useTaskKindStore.setState({ status: "loaded", byKind: { document_promotion: decl! } });
    const r = row({ stage: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    const rendered = [...document.querySelectorAll("[data-ingest-verb]")].map((b) => b.getAttribute("data-ingest-verb"));
    expect(rendered).toEqual(["rejected", "promoted"]);
  });
});

describe("IngestStatusCard — not found", () => {
  it("a not-found mark in the store shows the literal ambiguity", () => {
    useIngestStatusStore.setState({ notFound: { ghost: true } });
    render(<IngestStatusCard ingestId="ghost" />);
    expect(document.querySelector("[data-ingest-not-found]")?.textContent).toMatch(/Not found, or not visible to you./);
  });
});

describe("notice_id on the card", () => {
  it("draws `notice <id>` when non-null, and nothing (no placeholder) for null and absent", () => {
    const r = row({ stage: "promoted", notice_id: "PCN26-184" });
    const { unmount } = render(<SeededCard ingestId={r.ingest_id} seed={r} />);
    expect(document.querySelector("[data-ingest-notice-id]")?.textContent).toBe("notice PCN26-184");
    unmount();
    for (const over of [{ notice_id: null }, {}]) {
      const r2 = row({ stage: "promoted", ...over });
      const u = render(<SeededCard ingestId={r2.ingest_id} seed={r2} />);
      expect(document.querySelector("[data-ingest-notice-id]")).toBeNull();
      expect(document.body.textContent).not.toMatch(/unclassified/i);
      u.unmount();
    }
  });
});

describe("IngestStatusCard — failure reason, code, attempt, Retry", () => {
  const failure = (over: Record<string, unknown> = {}) => ({
    reason_code: "kind_unregistered", reason: "kind x is not registered: a, b", step: null, run_id: null, pin_digest: null, failed_at: 1, ...over,
  });
  const q = (sel: string) => document.querySelector(sel);
  const failedRow = (over: Partial<IngestStatusRow> = {}) =>
    row({ stage: "failed", detail: "old detail", failure: failure(), attempt: 1, ...over });

  it("draws failure.reason over detail, and falls back to detail when the fleet sends no failure", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow()} />);
    expect(q("[data-ingest-detail]")?.textContent).toBe("kind x is not registered: a, b");
    cleanup();
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage: "failed", detail: "old detail" })} />);
    expect(q("[data-ingest-detail]")?.textContent).toBe("old detail");
    expect(q("[data-ingest-reason-code]")).toBeNull();
  });

  it("draws the reason code verbatim, and attempt only above 1", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow({ attempt: 3 })} />);
    expect(q("[data-ingest-reason-code]")?.textContent).toBe("kind_unregistered");
    expect(q("[data-ingest-attempt]")?.textContent).toBe("attempt 3");
    cleanup();
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow({ attempt: 1 })} />);
    expect(q("[data-ingest-attempt]")).toBeNull();
  });

  it("timeout draws the muted note; another code does not", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow({ failure: failure({ reason_code: "timeout" }) })} />);
    expect(q("[data-ingest-timeout-note]")?.textContent).toBe("No stage was reported in time. It can still advance on its own.");
    cleanup();
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow()} />);
    expect(q("[data-ingest-timeout-note]")).toBeNull();
  });

  it.each(INGEST_STAGES.map((st) => [st]))("Retry for stage %s is present only for failed", (stage) => {
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage, failure: stage === "failed" ? failure() : null })} />);
    expect(q("[data-ingest-retry]") !== null).toBe(stage === "failed");
  });

  it("Retry uses the store action and the row goes back to received", async () => {
    retryIngest.mockResolvedValue({ ingest_id: INGEST_ID, stage: "received", attempt: 2 });
    useIngestStatusStore.setState({ rows: { [INGEST_ID]: failedRow() } });
    render(<IngestStatusCard ingestId={INGEST_ID} />);
    fireEvent.click(q("[data-ingest-retry]")!);
    await waitFor(() => expect(q("[data-ingest-retry]")).toBeNull());
    expect(retryIngest).toHaveBeenCalledTimes(1);
    expect(useIngestStatusStore.getState().rows[INGEST_ID]).toMatchObject({ stage: "received", attempt: 2 });
    expect(q("[data-ingest-attempt]")?.textContent).toBe("attempt 2");
  });

  it("a 409 shows the moved message", async () => {
    retryIngest.mockRejectedValue({ response: { status: 409, data: { detail: { error: "not_failed" } } } });
    fetchIngestStatus.mockResolvedValue(failedRow());
    useIngestStatusStore.setState({ rows: { [INGEST_ID]: failedRow() } });
    render(<IngestStatusCard ingestId={INGEST_ID} />);
    fireEvent.click(q("[data-ingest-retry]")!);
    await waitFor(() => expect(q("[data-ingest-retry-message]")?.textContent).toBe("It moved since it was read — refreshed."));
  });

  it("a 403 refusal is shown inline and the row stays failed", async () => {
    retryIngest.mockRejectedValue({ response: { status: 403, data: { detail: { error: "retry_is_pin_driven", message: "m" } } } });
    render(<SeededCard ingestId={INGEST_ID} seed={failedRow()} />);
    fireEvent.click(q("[data-ingest-retry]")!);
    await waitFor(() => expect(q("[data-ingest-retry-message]")?.textContent).toBe("This drop can’t be retried from here."));
    expect(q("[data-ingest-retry]")).toBeTruthy();
  });

  it("the Retry click does not reach the surrounding click handler", async () => {
    retryIngest.mockResolvedValue({ ingest_id: INGEST_ID, stage: "received", attempt: 2 });
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <SeededCard ingestId={INGEST_ID} seed={failedRow()} />
      </div>,
    );
    fireEvent.click(q("[data-ingest-retry]")!);
    await waitFor(() => expect(retryIngest).toHaveBeenCalled());
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("out-of-band document statuses (defect: the card froze at extracting)", () => {
  it("awaiting_origin draws its status and its waiting line", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage: "awaiting_origin" })} />);
    expect(document.querySelector('[data-ingest-status="awaiting_origin"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-awaiting="awaiting_origin"]')?.textContent).toBe(
      "Waiting for a steward to accept where it came from",
    );
  });

  it("review_rejected draws its detail and the current branch rung", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage: "review_rejected", detail: "wrong supplier" })} />);
    expect(document.querySelector("[data-ingest-detail]")?.textContent).toBe("wrong supplier");
    expect(document.querySelector('[data-ingest-ladder-stage="review_rejected"][data-ingest-ladder-state="current"]')).toBeTruthy();
  });

  // The card MOUNTS the chip and takes the corrected row it hands back (onRow -> the card's row):
  // a "?" at awaiting_kind, picked PDN, shows the server's next row without waiting for a poll.
  it("the card mounts the leaf chip, and a pick's returned row becomes the card's row", async () => {
    correctIngestLeaf.mockResolvedValue({ ...row({ stage: "review" }), leaf: "pdn", leaf_source: "corrected", corrected_by: "ana" });
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage: "awaiting_kind", leaf: null, leaf_source: null })} />);
    expect(document.querySelector("[data-leaf-chip]")?.textContent).toContain("? · couldn't tell — pick one");
    fireEvent.click(document.querySelector('[data-leaf-pick="pdn"]')!);
    await waitFor(() => expect(document.querySelector('[data-ingest-status="review"]')).toBeTruthy());
    expect(correctIngestLeaf).toHaveBeenCalledWith(INGEST_ID, "pdn");
    expect(document.querySelector("[data-leaf-chip]")?.getAttribute("data-leaf")).toBe("pdn");
    expect(document.querySelector("[data-leaf-chip]")?.textContent).toContain("PDN · corrected by ana");
  });

  it("awaiting_kind draws its waiting line", () => {
    render(<SeededCard ingestId={INGEST_ID} seed={row({ stage: "awaiting_kind" })} />);
    expect(document.querySelector('[data-ingest-awaiting="awaiting_kind"]')?.textContent).toBe("Waiting for its kind — pick PCN or PDN");
  });
});
