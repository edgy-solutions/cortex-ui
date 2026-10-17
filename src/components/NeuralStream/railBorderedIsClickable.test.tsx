/**
 * The rail's chip rule (architect, 2026-10-16, via Chris): BORDERED = CLICKABLE. Only an action gets
 * the bordered chip; a stage, a reason code or a task label is plain text. `timeout` (a reason code)
 * and `Retry` (an action) were drawn as the same chip, so the rail said both were buttons.
 *
 * A census over EVERY element the rail draws whose class list carries a border, not a check on the
 * chips that broke the rule: a new bordered label added later is caught by the same arm.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Artifact, TaskState } from "@/api/types";

vi.mock("./LiveAnswerStrip", () => ({ LiveAnswerStrip: () => null }));
vi.mock("./useLiveStages", () => ({ useLiveStages: () => ({ active: false }) }));

import { AnswersPanel } from "./AnswersPanel";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { ingestToArtifact } from "@/lib/ingestArtifact";
import { readIngestStatusRow } from "@/lib/ingestWire";

afterEach(() => {
  cleanup();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useAnswerPanelStore.setState({ sortMode: "TIME", search: "" });
});

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const ID = `sha256:${"734d9c".padEnd(64, "0")}`;

// The screenshot's row: failed on a timeout, at attempt 2, with Retry offered.
const failedDrop = (): Artifact =>
  ingestToArtifact({
    key: ID,
    filename: "EOL-36_BYV34-400.pdf",
    kind: "pdf",
    droppedAt: NOW - 60_000,
    phase: "status",
    ingestId: ID,
    error: null,
    acceptedThisSession: false,
    duplicate: null,
    note: null,
    notFound: false,
    row: readIngestStatusRow({
      ingest_id: ID,
      sha256: "734d9c".padEnd(64, "0"),
      kind: "pdf",
      stage: "failed",
      detail: "no stage move was reported within 3600 seconds of entering extracting", // a failed row must carry one
      duplicate: null,
      created_at: NOW - 60_000,
      updated_at: NOW - 60_000,
      origin: null,
      case_id: null,
      attempt: 2,
      failure: {
        reason_code: "timeout",
        reason: "no stage move was reported within 3600 seconds of entering extracting",
        step: null,
        run_id: null,
        pin_digest: null,
        failed_at: NOW - 60_000,
      },
    }),
  });

const task = (i: number, task_state: TaskState): Artifact =>
  ({
    id: `task-${i}`,
    status: "complete",
    created_at: NOW - i * 120_000,
    watermark: 0,
    question_text: `task ${i}`,
    summary: `task summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    task_ref: { taskId: `t-${i}`, workflowId: null, kind: "grouped_review", task_state, audience: "stewards", requestedBy: "svc:x", subjectRef: null },
  }) as unknown as Artifact;

const seed = () => useCanvasStore.setState({ artifacts: [failedDrop(), task(2, "pending"), task(3, "approved")] });

// Any all-sides border token: `border`, `border-2`, ... (`border-t`, `border-amber-400/40` are not one).
const BORDER = /^border(-\d+)?$/;
const bordered = () => [...document.querySelectorAll<HTMLElement>("*")].filter((el) => [...el.classList].some((c) => BORDER.test(c)));
const CLICKABLE_TAGS = new Set(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"]);
const clickable = (el: HTMLElement) => CLICKABLE_TAGS.has(el.tagName) || el.getAttribute("role") === "button";
const describeEl = (el: HTMLElement) =>
  `<${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => ` ${a.name}`).join("")}> "${(el.textContent ?? "").trim().slice(0, 30)}"`;

describe("the rail: bordered = clickable", () => {
  it("every bordered element on the rail is a control", () => {
    seed();
    render(<AnswersPanel />);
    const all = bordered();
    // The instrument: the census reaches the rows. Retry is a bordered button it MUST see.
    expect(all.some((el) => el.hasAttribute("data-ingest-retry")), "the census never reached the failed drop's Retry").toBe(true);
    expect(all.filter((el) => !clickable(el)).map(describeEl)).toEqual([]);
  });

  it("the reason code, the stage and the task labels are still drawn, as text", () => {
    seed();
    render(<AnswersPanel />);
    expect(document.querySelector("[data-ingest-reason-code]")?.textContent).toBe("timeout");
    expect(document.querySelector("[data-ingest-attempt]")?.textContent).toBe("attempt 2");
    expect(document.querySelector("[data-ingest-stage]")?.textContent).toBe("failed");
    expect(document.body.textContent).toContain("· pending");
    expect(document.body.textContent).toContain("· done");
  });
});
