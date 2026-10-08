/**
 * ACCESSIBILITY SEALS for IngestStatusCard: a named reason field, announced stage and refusals,
 * typed buttons — and an AST pass over the card source. Fixtures are copied from
 * IngestStatusCard.test.tsx.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { IngestStatusCard } from "./IngestStatusCard";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
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

const resolvedOrigin: IngestOrigin = {
  status: "resolved",
  document_type: "work instruction",
  program: "Line 4 retrofit",
  evidence_label: undefined,
} as IngestOrigin;

const renderReview = () => {
  const r = row({ stage: "review" });
  useHumanTaskStore.setState({ tasks: [promotionTask(r, { taskId: "task-9" })] });
  render(<IngestStatusCard ingestId={r.ingest_id} initialRow={r} pollIntervalMs={100000} />);
};

describe("IngestStatusCard a11y: labels and buttons", () => {
  it("the reason textbox is found by its accessible name", () => {
    renderReview();
    expect(screen.getByRole("textbox", { name: /reason for decision/i })).toBeTruthy();
  });

  it("every verb button has a name, a type, and no negative tabIndex", () => {
    renderReview();
    for (const name of [/promoted/i, /rejected/i]) {
      const b = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(b.type).toBe("button");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("IngestStatusCard a11y: live regions", () => {
  it("the stage display is reachable by role status", () => {
    render(<IngestStatusCard ingestId={INGEST_ID} initialRow={row()} pollIntervalMs={100000} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("extracting");
    expect(status.getAttribute("data-ingest-status")).toBe("extracting");
  });

  it("an act refusal is reachable by role alert and carries its text", async () => {
    actOnHumanTask.mockReset();
    actOnHumanTask.mockRejectedValue({
      response: {
        status: 409,
        data: { detail: { error: "ingest_node_absent", task_id: "task-9", message: "ingest node absent. Nothing was written." } },
      },
    });
    renderReview();
    fireEvent.click(screen.getByRole("button", { name: /promoted/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.hasAttribute("data-ingest-act-error")).toBe(true);
    expect(alert.textContent).toMatch(/Refused \(ingest_node_absent\): ingest node absent\. Nothing was written\./);
  });

  it("an origin-dispute refusal is reachable by role alert and carries its text", async () => {
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
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Nothing was written."));
    expect(screen.getByRole("alert").hasAttribute("data-ingest-origin-dispute-refusal")).toBe(true);
  });
});

describe("IngestStatusCard a11y: AST seal over the card source", () => {
  const FILE = join(__dirname, "IngestStatusCard.tsx");
  const readSrc = () => readFileSync(FILE, "utf8");

  type El = { tag: string; attrs: Set<string>; values: Record<string, string>; line: number };
  const elements = (text: string): El[] => {
    const out: El[] = [];
    const sf = ts.createSourceFile("card.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = new Set<string>();
        const values: Record<string, string> = {};
        for (const p of n.attributes.properties) {
          if (ts.isJsxAttribute(p)) {
            attrs.add(p.name.getText());
            values[p.name.getText()] = p.initializer ? p.initializer.getText() : "";
          }
        }
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        out.push({ tag: n.tagName.getText(), attrs, values, line });
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out.filter((e) => /^[a-z]/.test(e.tag)); // intrinsic elements only
  };
  const HANDLERS = ["onClick", "onKeyDown", "onMouseDown"];
  const INTERACTIVE = new Set(["button", "input", "textarea", "select", "a"]);

  it("(a) no non-interactive intrinsic element is clickable without role and tabIndex", () => {
    const withHandler = elements(readSrc()).filter((e) => HANDLERS.some((h) => e.attrs.has(h)));
    // Census before the pass: 2 (the dispute button and the verb button).
    expect(withHandler.length, "population floor: handler-bearing elements inspected").toBeGreaterThanOrEqual(2);
    const bad = withHandler.filter(
      (e) => !INTERACTIVE.has(e.tag) && !(e.attrs.has("role") && e.attrs.has("tabIndex")),
    );
    expect(bad.map((e) => `L${e.line} <${e.tag}> is clickable but not keyboard-reachable`)).toEqual([]);
  });

  it("(b) every input/textarea/select has an accessible name", () => {
    const all = elements(readSrc());
    const fields = all.filter((e) => ["input", "textarea", "select"].includes(e.tag));
    // Census before the pass: 1 (the reason input).
    expect(fields.length, "population floor: fields inspected").toBeGreaterThanOrEqual(1);
    const labelFor = new Set(all.filter((e) => e.tag === "label").map((e) => e.values.htmlFor));
    const bad = fields.filter(
      (e) =>
        !(e.attrs.has("aria-label") || e.attrs.has("aria-labelledby")) &&
        !(e.values.id && labelFor.has(e.values.id)),
    );
    expect(bad.map((e) => `L${e.line} <${e.tag}> has no accessible name`)).toEqual([]);
  });

  it("(c) every button has an explicit type", () => {
    const buttons = elements(readSrc()).filter((e) => e.tag === "button");
    // Census before the pass: 2.
    expect(buttons.length, "population floor: buttons inspected").toBeGreaterThanOrEqual(2);
    const bad = buttons.filter((e) => !e.attrs.has("type"));
    expect(bad.map((e) => `L${e.line} <button> has no explicit type`)).toEqual([]);
  });
});
