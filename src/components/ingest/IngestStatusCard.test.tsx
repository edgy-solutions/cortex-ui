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
    render(<IngestStatusCard ingestId={INGEST_ID} initialRow={row()} pollIntervalMs={100000} />);
    expect(document.querySelector(`[data-ingest-id="${INGEST_ID}"]`)).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="received"][data-ingest-ladder-state="done"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="extracting"][data-ingest-ladder-state="current"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"][data-ingest-ladder-state="pending"]')).toBeTruthy();
  });

  it("shows the ingest_id as the header text", () => {
    render(<IngestStatusCard ingestId={INGEST_ID} initialRow={row()} pollIntervalMs={100000} />);
    expect(screen.getByText(INGEST_ID)).toBeTruthy();
  });

  it("draws NO ladder for a duplicate row, but draws the message and of_ingest_id", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({
          stage: null,
          duplicate: {
            of_ingest_id: OTHER_INGEST_ID,
            message: "already processed on 2026-09-29 from work-instruction.pdf",
          },
        })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector("[data-ingest-ladder]")).toBeNull();
    const dup = document.querySelector("[data-ingest-duplicate]");
    expect(dup?.textContent).toMatch(/already processed/);
    expect(dup?.textContent).toMatch(new RegExp(OTHER_INGEST_ID));
  });

  it("a duplicate whose original IS visible names the original's stage", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({
          stage: "awaiting_disposition",
          duplicate: { of_ingest_id: OTHER_INGEST_ID, message: "already processed" },
        })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector("[data-ingest-duplicate]")?.textContent).toMatch(/awaiting_disposition/);
  });

  it("rejected is drawn as a terminal branch off awaiting_disposition, not past promoted, and draws detail", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ stage: "rejected", detail: "not the right document" })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state")).toBe("pending");
    expect(document.querySelector('[data-ingest-ladder-stage="rejected"]')?.getAttribute("data-ingest-ladder-state")).toBe("current");
    expect(screen.getByText(/not the right document/)).toBeTruthy();
  });

  it("failed draws detail too, with only received marked done", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ stage: "failed", detail: "extraction crashed" })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector('[data-ingest-ladder-stage="received"]')?.getAttribute("data-ingest-ladder-state")).toBe("done");
    expect(document.querySelector('[data-ingest-ladder-stage="extracting"]')?.getAttribute("data-ingest-ladder-state")).toBe("pending");
    expect(screen.getByText(/extraction crashed/)).toBeTruthy();
  });

  it("no matching task renders 'no review task visible to you'", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ stage: "awaiting_disposition" })}
        pollIntervalMs={100000}
      />,
    );
    expect(document.querySelector("[data-ingest-no-review-task]")?.textContent).toMatch(/no review task visible to you/);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(0);
  });

  it("a matching pending document_promotion task renders its verbs — THE BRIDGE IS GONE, ingest_id is read as-is", () => {
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
    expect(document.querySelectorAll("[data-ingest-verb]")).toHaveLength(2);
    expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-verb="rejected"]')).toBeTruthy();
  });

  it("a payload naming a different ingest_id does NOT match", () => {
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({
      tasks: [promotionTask(r, { payload: { ingest_id: OTHER_INGEST_ID } })],
    });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
    expect(document.querySelector("[data-ingest-no-review-task]")).toBeTruthy();
  });

  it("the rejected button is disabled without a comment, and enables once one is typed", () => {
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
    const rejectBtn = document.querySelector('[data-ingest-verb="rejected"]') as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);
    fireEvent.change(document.querySelector("[data-ingest-reason-input]")!, { target: { value: "wrong document" } });
    expect(rejectBtn.disabled).toBe(false);
    // promoted never requires a reason
    expect((document.querySelector('[data-ingest-verb="promoted"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking promoted calls actOnHumanTask(task.taskId, 'promoted', '')", async () => {
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
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
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
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
    const r = row({ stage: "awaiting_disposition" });
    useHumanTaskStore.setState({ tasks: [promotionTask(r)] });
    render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
    const rendered = [...document.querySelectorAll("[data-ingest-verb]")].map((b) => b.getAttribute("data-ingest-verb"));
    expect(rendered).toEqual(["rejected", "promoted"]);
  });
});

describe("IngestStatusCard — not found", () => {
  it("a 404 shows the literal ambiguity and stops polling", async () => {
    fetchIngestStatus.mockRejectedValue({ response: { status: 404, data: { detail: "ingest not found" } } });
    render(<IngestStatusCard ingestId="ghost" pollIntervalMs={100000} />);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-not-found]")?.textContent).toMatch(/Not found, or not visible to you\./),
    );
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
  });
});
