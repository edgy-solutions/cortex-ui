/**
 * PCN26-119 @ rev 175 (fleet 914c7faa) — Lane 1's LIVE capture of the ingest card through
 * review, the real `document_promotion` task, and the capturer's own wrong-verb 422, stopping
 * at the SAME producer defect `ingestPcn26117Fixture.ts` predicted from source alone: the task
 * payload gateway.py writes carries only 3 of the 7 `PAYLOAD_FIELDS` promotion.py requires.
 *
 * `sessions/2026-10-07-payload-ingest-pcn26-119-rev-175.json` — 8 hops, never read whole here
 * (inspected by a scratchpad node script before this file was written). `stages_seen` is
 * `["received","extracting","review"]`; `stopped_at` is `"4-act: 422"` — promoted and the answer
 * label were never reached, so those two stay with the BUILT `ingestPcn26117Fixture.ts` fixture
 * (see its header) until a live capture reaches past review.
 *
 * This file drives the REAL `IngestStatusCard` and `ApprovalTaskCard` — never asserting against
 * the capture's data directly — the same way `ingestPromotionFixture.test.tsx` mocks the api.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { ApprovalTaskCard } from "@/components/ApprovalTask/ApprovalTaskCard";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { humanTaskFromRow } from "@/lib/seedHumanTasks";
import {
  readIngestStatusRow,
  ingestPollingDone,
  payloadMatchesIngestId,
  promotionIngestId,
} from "@/lib/ingestWire";
import { buildPcn26117Fixture, type Pcn26117Seed } from "@/lib/ingestPcn26117Fixture";

const fetchIngestStatus = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...args: unknown[]) => fetchIngestStatus(...args),
  disputeIngestOrigin: vi.fn(),
}));

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...args: unknown[]) => actOnHumanTask(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  actOnHumanTask.mockReset();
  useHumanTaskStore.setState({ tasks: [] });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

interface Pcn119Hop {
  request?: { method?: string; path?: string; headers?: Record<string, unknown>; form?: Record<string, unknown> | null };
  response: {
    status?: number;
    body?: unknown;
    rows_total?: number;
    matching?: Record<string, unknown>[];
  };
}

interface Pcn119Capture {
  captured_by: string;
  release: string;
  started_at: string;
  file: unknown;
  hops: Pcn119Hop[];
  ingest_id: string;
  stages_seen: string[];
  polled_s: number;
  resumed_at: string;
  resume_reason: string;
  stopped_at: string;
}

function loadCapture(): Pcn119Capture {
  const file = path.join(__dirname, "../../../sessions/2026-10-07-payload-ingest-pcn26-119-rev-175.json");
  return JSON.parse(readFileSync(file, "utf8")) as Pcn119Capture;
}

describe("PCN26-119 live capture (rev 175) — review, the real task, the capturer's wrong verb, the producer's own 422", () => {
  const capture = loadCapture();

  it("the capture's own stages_seen is received/extracting/review — promoted was never reached", () => {
    expect(capture.stages_seen).toEqual(["received", "extracting", "review"]);
    expect(capture.stopped_at).toBe("4-act: 422");
  });

  describe("1 — the live ladder", () => {
    it("every status hop (1-3) parses with the REAL readIngestStatusRow — no nulls", () => {
      const rows = [1, 2, 3].map((i) => readIngestStatusRow(capture.hops[i].response.body));
      for (const row of rows) expect(row).not.toBeNull();
      expect(rows.map((r) => r!.stage)).toEqual(["received", "extracting", "review"]);
    });

    it("review keeps polling — ingestPollingDone is false", () => {
      const reviewRow = readIngestStatusRow(capture.hops[3].response.body)!;
      expect(ingestPollingDone(reviewRow)).toBe(false);
    });

    it("at hop 3, the card draws received/extracting done, review current, promoted pending", () => {
      const reviewRow = readIngestStatusRow(capture.hops[3].response.body)!;
      fetchIngestStatus.mockResolvedValue(capture.hops[3].response.body);
      render(<IngestStatusCard ingestId={reviewRow.ingest_id} initialRow={reviewRow} pollIntervalMs={100000} />);
      expect(
        document.querySelector('[data-ingest-ladder-stage="received"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("done");
      expect(
        document.querySelector('[data-ingest-ladder-stage="extracting"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("done");
      expect(
        document.querySelector('[data-ingest-ladder-stage="review"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("current");
      expect(
        document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("pending");
    });
  });

  describe("2 — the live task row (hop 6)", () => {
    const reviewRow = readIngestStatusRow(capture.hops[3].response.body)!;
    const taskRow = capture.hops[6].response.matching![0];
    const humanTask = humanTaskFromRow(taskRow)!;

    it("the row's own declaration accepts exactly promoted/rejected", () => {
      const decl = taskRow.declaration as { accepts: string[] };
      expect(decl.accepts).toEqual(["promoted", "rejected"]);
    });

    it("the task's payload matches this row via payloadMatchesIngestId", () => {
      expect(payloadMatchesIngestId(humanTask.payload, promotionIngestId(reviewRow))).toBe(true);
    });

    it(
      // Hop 5 posted decision "approved" and was refused 422 invalid_decision_for_kind — THAT
      // WAS THE CAPTURER'S OWN WRONG VERB, NOT CORTEX'S: this card never offers "approved" for a
      // document_promotion task, built or live, so cortex could not have sent hop 5's request.
      'offers EXACTLY ["promoted","rejected"] — "approved" is never a button here',
      () => {
        useHumanTaskStore.setState({ tasks: [humanTask] });
        render(<IngestStatusCard ingestId={reviewRow.ingest_id} initialRow={reviewRow} pollIntervalMs={100000} />);
        const verbs = [...document.querySelectorAll("[data-ingest-verb]")].map((b) =>
          b.getAttribute("data-ingest-verb"),
        );
        expect(verbs).toEqual(["promoted", "rejected"]);
        expect(document.querySelector('[data-ingest-verb="approved"]')).toBeNull();
      },
    );
  });

  describe("3 — the live refusal (hop 7): promotion_payload_invalid", () => {
    const reviewRow = readIngestStatusRow(capture.hops[3].response.body)!;
    const taskRow = capture.hops[6].response.matching![0];
    const humanTask = humanTaskFromRow(taskRow)!;
    const refusal = (capture.hops[7].response.body as { detail: { error: string; task_id: string; message: string } })
      .detail;

    it('clicking promote draws data-ingest-act-refusal="promotion_payload_invalid" and the live message; the ladder stays at review; the task is not resolved', async () => {
      actOnHumanTask.mockRejectedValue({ response: { status: 422, data: { detail: refusal } } });
      useHumanTaskStore.setState({ tasks: [humanTask] });
      render(<IngestStatusCard ingestId={reviewRow.ingest_id} initialRow={reviewRow} pollIntervalMs={100000} />);
      fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);

      await waitFor(() =>
        expect(document.querySelector("[data-ingest-act-error]")?.getAttribute("data-ingest-act-refusal")).toBe(
          "promotion_payload_invalid",
        ),
      );
      const text = document.querySelector("[data-ingest-act-error]")?.textContent ?? "";
      expect(text).toContain(refusal.message);

      expect(
        document.querySelector('[data-ingest-ladder-stage="review"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("current");
      expect(
        document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("pending");

      // NOT resolved: still offered, never collapsed to "no review task".
      expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
      expect(document.querySelector("[data-ingest-no-review-task]")).toBeNull();
    });
  });

  describe("4 — the prediction met the wire", () => {
    const statusBody = capture.hops[1].response.body as Record<string, unknown>;
    const receivedRow = readIngestStatusRow(statusBody)!;
    const dropped = statusBody.dropped_by as { authz_id: string };
    const seed: Pcn26117Seed = {
      ingestId: receivedRow.ingest_id,
      sha256: receivedRow.sha256,
      kind: receivedRow.kind as "pdf",
      droppedBy: dropped,
      createdAt: receivedRow.created_at,
    };
    const fixture = buildPcn26117Fixture(seed);
    const built4a = fixture.hops.find((h) => h.id === "4a-act-refused-422")!;
    const builtMessage = (built4a.response.body as { message: string }).message;
    const liveDetail = (capture.hops[7].response.body as { detail: { message: string } }).detail;

    it("the PCN26-117 fixture's 4a message equals hop 7's detail.message byte for byte", () => {
      expect(builtMessage).toBe(liveDetail.message);
    });

    it("the fixture's missing-fields list equals the live one, in order (parsed off the message's own bracketed repr — no helper shared with the fixture)", () => {
      const start = liveDetail.message.indexOf("[");
      const end = liveDetail.message.indexOf("]");
      const inside = liveDetail.message.slice(start + 1, end);
      const liveMissing = inside.length === 0 ? [] : inside.split(", ").map((s) => s.slice(1, -1));
      expect(fixture.missingPayloadFields).toEqual(liveMissing);
    });
  });

  describe("6 — hop 5's 422 (the capturer's own wrong verb) reads through ApprovalTaskCard's EXISTING corrected-menu reader", () => {
    // Per the spec: cortex already has a reader for invalid_decision_for_kind —
    // ApprovalTaskCard's `corrected` state (see its doc comment). This is the ONE arm driving it
    // off this capture's own hop 5 body, not a new reader.
    const taskRow = capture.hops[6].response.matching![0];
    const hop5Detail = (
      capture.hops[5].response.body as {
        detail: { error: string; kind: string; allowed: string[]; message: string };
      }
    ).detail;

    it('adopts hop 5\'s allowed list — ["promoted","rejected"] — into the corrected menu', async () => {
      expect(hop5Detail.allowed).toEqual(["promoted", "rejected"]);
      actOnHumanTask.mockRejectedValue({ response: { status: 422, data: { detail: hop5Detail } } });
      render(
        <ApprovalTaskCard
          task={{
            task_id: String(taskRow.task_id),
            kind: String(taskRow.kind),
            title: String(taskRow.title),
            summary: String(taskRow.summary),
            audience: String(taskRow.audience),
            requested_by: String(taskRow.requested_by),
            subject_ref: (taskRow.subject_ref as string | null) ?? null,
            declaration: taskRow.declaration,
            payload: taskRow.payload,
          }}
        />,
      );
      fireEvent.click(document.querySelector('[data-verb="promoted"]')!);

      await waitFor(() => {
        const note = document.querySelector("[data-decision-corrected]");
        expect(note).not.toBeNull();
        expect(note!.textContent).toContain(hop5Detail.message);
      });
      const verbs = [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));
      expect(verbs).toEqual(["promoted", "rejected"]);
    });
  });
});
