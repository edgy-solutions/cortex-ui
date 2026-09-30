import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { promotionIngestId, type IngestStatusRow } from "@/lib/ingestWire";

const fetchIngestStatus = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...args: unknown[]) => fetchIngestStatus(...args),
}));

const actOnHumanTask = vi.fn().mockResolvedValue({ task_id: "t", decision: "promoted" });
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...args: unknown[]) => actOnHumanTask(...args),
}));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  actOnHumanTask.mockReset();
  actOnHumanTask.mockResolvedValue({ task_id: "t", decision: "promoted" });
  useHumanTaskStore.setState({ tasks: [] });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

const row = (over: Partial<IngestStatusRow> = {}): IngestStatusRow => ({
  id: "3f9a2b",
  sha256: "3f9a2b",
  kind: "pdf",
  object_prefix: "ingest/3f9a2b/",
  submitted_by: "alice@example.com",
  on_behalf_of: "alice@example.com",
  source: "work-instruction.pdf",
  status: "extracting",
  extracted_count: null,
  extracted_total: null,
  duplicate_of: null,
  detail: null,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
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
  summary: r.source ?? r.id,
  requestedBy: "bob",
  subjectRef: r.id,
  payload: { ingest_id: promotionIngestId(r) },
  createdAt: 0,
  ...over,
});

describe("IngestStatusCard — keyed by row.id", () => {
  it("draws the stage ladder, and the card is keyed by row.id", () => {
    render(<IngestStatusCard ingestId="3f9a2b" initialRow={row()} pollIntervalMs={100000} />);
    expect(document.querySelector('[data-ingest-id="3f9a2b"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="received"][data-ingest-ladder-state="done"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="extracting"][data-ingest-ladder-state="current"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"][data-ingest-ladder-state="pending"]')).toBeTruthy();
  });

  it("shows source as the name", () => {
    render(<IngestStatusCard ingestId="3f9a2b" initialRow={row({ source: "widget.pdf" })} pollIntervalMs={100000} />);
    expect(screen.getByText("widget.pdf")).toBeTruthy();
  });

  it("shows extracted_count/extracted_total when present", () => {
    render(
      <IngestStatusCard
        ingestId="3f9a2b"
        initialRow={row({ status: "extracted", extracted_count: 8, extracted_total: 12 })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector("[data-ingest-extracted]")?.textContent).toMatch(/8 \/ 12/);
  });

  it("draws NO ladder for a duplicate row, but draws the message from detail + duplicate_of", () => {
    render(
      <IngestStatusCard
        ingestId="3f9a2b"
        initialRow={row({
          status: "duplicate",
          detail: "already processed on 2026-09-29 from work-instruction.pdf",
          duplicate_of: "a1b2c3",
        })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector("[data-ingest-ladder]")).toBeNull();
    const dup = document.querySelector("[data-ingest-duplicate]");
    expect(dup?.textContent).toMatch(/already processed/);
    expect(dup?.textContent).toMatch(/a1b2c3/);
  });

  it("rejected is drawn as a terminal branch off review, not past promoted", () => {
    render(
      <IngestStatusCard
        ingestId="3f9a2b"
        initialRow={row({ status: "rejected", detail: "not the right document" })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state")).toBe("pending");
    expect(document.querySelector('[data-ingest-ladder-stage="rejected"]')?.getAttribute("data-ingest-ladder-state")).toBe("current");
    expect(screen.getByText(/not the right document/)).toBeTruthy();
  });

  it("no matching task renders 'no review task visible to you'", () => {
    render(<IngestStatusCard ingestId="3f9a2b" initialRow={row({ status: "review" })} pollIntervalMs={100000} />);
    expect(document.querySelector("[data-ingest-no-review-task]")?.textContent).toMatch(/no review task visible to you/);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(0);
  });

  it("a matching pending document_promotion task renders its verbs via THE ID BRIDGE", () => {
    const r = row({ status: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(2);
    expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-verb="rejected"]')).toBeTruthy();
  });

  it("a bare (unbridged) sha256 on the payload does NOT match — proves the bridge is load-bearing", () => {
    const r = row({ status: "review" });
    useHumanTaskStore.setState({
      tasks: [promotionTask(r, { payload: { ingest_id: r.sha256 } })], // no "sha256:" prefix
    });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    expect(document.querySelector("[data-ingest-no-review-task]")).toBeTruthy();
  });

  it("the rejected button is disabled without a comment, and enables once one is typed", () => {
    const r = row({ status: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    const rejectBtn = document.querySelector('[data-ingest-verb="rejected"]') as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);
    fireEvent.change(document.querySelector("[data-ingest-reason-input]")!, { target: { value: "wrong document" } });
    expect(rejectBtn.disabled).toBe(false);
    // promoted never requires a reason
    expect((document.querySelector('[data-ingest-verb="promoted"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking promoted calls actOnHumanTask(task.taskId, 'promoted', '')", async () => {
    const r = row({ status: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("task-9", "promoted", ""));
  });

  it("a 503 refusal on act shows the server's message and renders NO 'done' state — the task stays", async () => {
    actOnHumanTask.mockReset();
    actOnHumanTask.mockRejectedValue({
      response: {
        status: 503,
        data: { detail: { error: "promotion_store_unconfigured", task_id: "task-9", message: "promotion store not configured" } },
      },
    });
    const r = row({ status: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-act-error]")?.textContent).toMatch(/promotion store not configured/),
    );
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
    const r = row({ status: "review" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.id} initialRow={r} pollIntervalMs={100000} />);
    const rendered = [...document.querySelectorAll("[data-ingest-verb]")].map((b) => b.getAttribute("data-ingest-verb"));
    expect(rendered).toEqual(["rejected", "promoted"]);
  });
});

describe("IngestStatusCard — not found", () => {
  it("a 404 shows the literal ambiguity and stops polling", async () => {
    fetchIngestStatus.mockRejectedValue({ response: { status: 404, data: { detail: "not found" } } });
    render(<IngestStatusCard ingestId="ghost" pollIntervalMs={100000} />);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-not-found]")?.textContent).toMatch(/Not found, or not visible to you\./),
    );
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
  });
});
