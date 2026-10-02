import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { promotionIngestId, type IngestStatusRow } from "@/lib/ingestWire";
import type { IngestOrigin } from "@/lib/ingestOrigin";

const fetchIngestStatus = vi.fn();
const disputeIngestOrigin = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...args: unknown[]) => fetchIngestStatus(...args),
  disputeIngestOrigin: (...args: unknown[]) => disputeIngestOrigin(...args),
}));

const actOnHumanTask = vi.fn().mockResolvedValue({ task_id: "t", decision: "promoted" });
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...args: unknown[]) => actOnHumanTask(...args),
}));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  disputeIngestOrigin.mockReset();
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
  origin: null,
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

/**
 * CORTEX-PROPOSED ORIGIN — Section 3. `row.origin === null` (today's real server) is drawn on
 * ITS OWN attribute, `data-ingest-origin-unreported`, never as a value of `data-ingest-origin` —
 * the absent≠unresolved invariant, checked at the selector level: a test (or a future caller)
 * keyed on `[data-ingest-origin]` alone can never pick up the absent case by accident.
 */
describe("IngestStatusCard — origin (CORTEX-PROPOSED)", () => {
  const resolvedOrigin: IngestOrigin = {
    status: "resolved",
    document_type: "work instruction",
    program: "Line 4 retrofit",
    evidence_label: undefined,
  } as IngestOrigin;

  const unresolvedOrigin: IngestOrigin = { status: "unresolved" };

  it("origin absent (today's real server) draws data-ingest-origin-unreported, no data-ingest-origin, no action", () => {
    render(<IngestStatusCard ingestId={INGEST_ID} initialRow={row({ origin: null })} pollIntervalMs={100000} />);
    const el = document.querySelector("[data-ingest-origin-unreported]");
    expect(el?.textContent).toBe("Origin: not reported by this server");
    expect(document.querySelector("[data-ingest-origin]")).toBeNull();
    expect(document.querySelector("[data-ingest-origin-dispute]")).toBeNull();
  });

  it("resolved origin draws data-ingest-origin=\"resolved\", the summary, and ONE dispute button", () => {
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ origin: resolvedOrigin })}
        pollIntervalMs={100000}
        onBehalfOf="steward@example.com"
      />,
    );
    expect(document.querySelector('[data-ingest-origin="resolved"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-origin="resolved"]')?.textContent).toMatch(
      /work instruction, Line 4 retrofit/,
    );
    expect(document.querySelectorAll("[data-ingest-origin-dispute]")).toHaveLength(1);
    expect(document.querySelector("[data-ingest-origin-unreported]")).toBeNull();
  });

  it("unresolved origin draws data-ingest-origin=\"unresolved\", the summary and the visibility note, and NO dispute button", () => {
    render(
      <IngestStatusCard ingestId={INGEST_ID} initialRow={row({ origin: unresolvedOrigin })} pollIntervalMs={100000} />,
    );
    const section = document.querySelector('[data-ingest-origin="unresolved"]');
    expect(section?.textContent).toMatch(/origin unresolved — awaiting steward/);
    expect(document.querySelector("[data-ingest-origin-visibility]")?.textContent).toBe(
      "Visible only to you until a steward resolves its origin.",
    );
    expect(document.querySelector("[data-ingest-origin-dispute]")).toBeNull();
  });

  it("a successful dispute replaces the button with data-ingest-origin-disputed, naming the task id", async () => {
    disputeIngestOrigin.mockResolvedValue({ steward_task_id: "task-77" });
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ origin: resolvedOrigin })}
        pollIntervalMs={100000}
        onBehalfOf="steward@example.com"
      />,
    );
    fireEvent.click(document.querySelector("[data-ingest-origin-dispute]")!);
    await waitFor(() => expect(document.querySelector("[data-ingest-origin-disputed]")).toBeTruthy());
    expect(document.querySelector("[data-ingest-origin-disputed]")?.textContent).toMatch(/Sent to the steward/);
    expect(document.querySelector("[data-ingest-origin-disputed]")?.textContent).toMatch(/task-77/);
    expect(document.querySelector("[data-ingest-origin-dispute]")).toBeNull();
    expect(disputeIngestOrigin).toHaveBeenCalledWith(INGEST_ID, "steward@example.com");
  });

  it("a 404 refusal shows 'does not accept origin disputes yet', and the button stays enabled", async () => {
    disputeIngestOrigin.mockRejectedValue({ response: { status: 404, data: { detail: "not found" } } });
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ origin: resolvedOrigin })}
        pollIntervalMs={100000}
        onBehalfOf="steward@example.com"
      />,
    );
    fireEvent.click(document.querySelector("[data-ingest-origin-dispute]")!);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-origin-dispute-refusal]")?.textContent).toBe(
        "This server does not accept origin disputes yet.",
      ),
    );
    const button = document.querySelector("[data-ingest-origin-dispute]") as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it("a named-error refusal is shown via readActRefusal's shape, button stays enabled, task NOT rendered disputed", async () => {
    disputeIngestOrigin.mockRejectedValue({
      response: { status: 503, data: { detail: { error: "steward_queue_unavailable", message: "Nothing was written." } } },
    });
    render(
      <IngestStatusCard
        ingestId={INGEST_ID}
        initialRow={row({ origin: resolvedOrigin })}
        pollIntervalMs={100000}
        onBehalfOf="steward@example.com"
      />,
    );
    fireEvent.click(document.querySelector("[data-ingest-origin-dispute]")!);
    await waitFor(() =>
      expect(document.querySelector("[data-ingest-origin-dispute-refusal]")?.textContent).toBe("Nothing was written."),
    );
    expect(document.querySelector("[data-ingest-origin-dispute-refusal]")?.getAttribute("data-ingest-origin-dispute-refusal")).toBe(
      "steward_queue_unavailable",
    );
    expect(document.querySelector("[data-ingest-origin-disputed]")).toBeNull();
    const button = document.querySelector("[data-ingest-origin-dispute]") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
