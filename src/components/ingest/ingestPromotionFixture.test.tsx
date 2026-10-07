/**
 * The PCN26-117 ingest, driven through review → promoted → the answer label — against
 * `src/lib/ingestPcn26117Fixture.ts`, built from invincible-agent producer source at fleet
 * 06b81540 (helm rev 174), NOT from a live capture: nothing past `received` has been witnessed
 * yet (see the fixture's own header and doc comment). This drives the REAL components —
 * `IngestStatusCard` and `ProvenanceFloorLabel` — the same way `IngestStatusCard.test.tsx` mocks
 * the api, never asserting against the fixture's data directly.
 *
 * Thursday's live capture, once it exists, replaces every `built_from` hop the fixture carries.
 * This file does not detect that swap — `ingestCapture.test.tsx`'s stall arm does, by going red
 * once a capture's `stages_seen` moves past `received`. See the `it.todo`s left there.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestStatusCard } from "./IngestStatusCard";
import { ProvenanceFloorLabel } from "./ProvenanceFloorLabel";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { humanTaskFromRow } from "@/lib/seedHumanTasks";
import {
  readIngestStatusRow,
  ingestPollingDone,
  payloadMatchesIngestId,
  promotionIngestId,
  readProvenanceFloor,
  provenanceFloorIsUnverified,
} from "@/lib/ingestWire";
import { buildPcn26117Fixture, type Pcn26117Fixture, type Pcn26117Seed } from "@/lib/ingestPcn26117Fixture";

const fetchIngestStatus = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...args: unknown[]) => fetchIngestStatus(...args),
  disputeIngestOrigin: vi.fn(),
}));

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...args: unknown[]) => actOnHumanTask(...args),
}));

afterEach(() => {
  cleanup();
  fetchIngestStatus.mockReset();
  actOnHumanTask.mockReset();
  useHumanTaskStore.setState({ tasks: [] });
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

/**
 * The seed — loaded from the REAL rev-174 capture, same JSON-import mechanism as
 * `ingestCapture.test.tsx` (`readFileSync` + `JSON.parse`, never inlined). Everything the fixture
 * builds past `received` is built on THIS ingest_id, kind and dropped_by.
 */
interface RevCapture {
  hops: Array<{ response?: { body?: unknown } }>;
}

function loadSeed(): Pcn26117Seed {
  const file = path.join(__dirname, "../../../sessions/2026-10-06-payload-ingest-pcn26-117-rev-174.json");
  const capture = JSON.parse(readFileSync(file, "utf8")) as RevCapture;
  const statusBody = capture.hops[1]?.response?.body as Record<string, unknown>;
  const row = readIngestStatusRow(statusBody);
  if (!row) throw new Error("rev-174 capture's status hop did not read as an ingest status row");
  const dropped = statusBody.dropped_by as { authz_id: string };
  return {
    ingestId: row.ingest_id,
    sha256: row.sha256,
    kind: row.kind as "pdf",
    droppedBy: dropped,
    createdAt: row.created_at,
  };
}

function hop(fixture: Pcn26117Fixture, id: string) {
  const h = fixture.hops.find((x) => x.id === id);
  if (!h) throw new Error(`fixture has no hop ${id}`);
  return h;
}

describe("PCN26-117 — review → promoted → the answer label (built fixture, real components)", () => {
  const seed = loadSeed();
  const fixture = buildPcn26117Fixture(seed);

  it("the seed is the real rev-174 capture's own ingest_id/kind/dropped_by", () => {
    expect(fixture.seed.ingestId).toBe("sha256:b58ec2f6e0438479eea35715a060d9686a8e3efa49803202c15f18dde9f0745c");
    expect(fixture.seed.kind).toBe("pdf");
    expect(fixture.seed.droppedBy).toEqual({ authz_id: "alice@example.com" });
  });

  describe("B1 — polling at review", () => {
    const reviewRow = readIngestStatusRow(hop(fixture, "2b-status-review").response.body)!;
    const taskRow = (hop(fixture, "3-human-task-row").response.body as { tasks: Record<string, unknown>[] }).tasks[0];
    const humanTask = humanTaskFromRow(taskRow)!;

    it("the ladder marks received/extracting done, review current, promoted pending", () => {
      useHumanTaskStore.setState({ tasks: [humanTask] });
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

    it("ingestPollingDone is false at review", () => {
      expect(ingestPollingDone(reviewRow)).toBe(false);
    });

    it("the card offers promote/reject via payloadMatchesIngestId, finding the human_tasks row's payload", () => {
      expect(payloadMatchesIngestId(humanTask.payload, promotionIngestId(reviewRow))).toBe(true);
      useHumanTaskStore.setState({ tasks: [humanTask] });
      render(<IngestStatusCard ingestId={reviewRow.ingest_id} initialRow={reviewRow} pollIntervalMs={100000} />);
      expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
      expect(document.querySelector('[data-ingest-verb="rejected"]')).toBeTruthy();
      expect(document.querySelector("[data-ingest-no-review-task]")).toBeNull();
    });
  });

  describe("B2 — the refusal (4a): what 06b81540 will actually do", () => {
    const reviewRow = readIngestStatusRow(hop(fixture, "2b-status-review").response.body)!;
    const taskRow = (hop(fixture, "3-human-task-row").response.body as { tasks: Record<string, unknown>[] }).tasks[0];
    const humanTask = humanTaskFromRow(taskRow)!;
    const refusal = hop(fixture, "4a-act-refused-422").response.body as {
      error: string;
      task_id: string;
      message: string;
    };

    it('draws data-ingest-act-refusal="promotion_payload_invalid" and the message, keeps the ladder at review, and does not resolve the task', async () => {
      actOnHumanTask.mockRejectedValue({
        response: { status: 422, data: { detail: refusal } },
      });
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

      // the ladder never moved off review
      expect(
        document.querySelector('[data-ingest-ladder-stage="review"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("current");
      expect(
        document.querySelector('[data-ingest-ladder-stage="promoted"]')?.getAttribute("data-ingest-ladder-state"),
      ).toBe("pending");

      // the task is NOT drawn as resolved — still offered, never collapsed to "no review task"
      expect(document.querySelector('[data-ingest-verb="promoted"]')).toBeTruthy();
      expect(document.querySelector("[data-ingest-no-review-task]")).toBeNull();
    });

    it("this is the arm Thursday's live capture would indict the producer with, if it still refuses this way", () => {
      // Documents the defect this hop is built from, independently of whatever cortex draws.
      expect(refusal.error).toBe("promotion_payload_invalid");
    });
  });

  describe("B3 — the success (4b, hypothetical): the next poll reaches promoted", () => {
    it("the ladder completes, polling stops, and detail is drawn ONLY per today's existing rule (rejected/failed, not promoted)", async () => {
      const reviewRow = readIngestStatusRow(hop(fixture, "2b-status-review").response.body)!;
      const taskRow = (hop(fixture, "3-human-task-row").response.body as { tasks: Record<string, unknown>[] }).tasks[0];
      const humanTask = humanTaskFromRow(taskRow)!;
      const success = hop(fixture, "4b-act-200-promoted-hypothetical").response.body;
      const promotedBody = hop(fixture, "5-status-promoted").response.body;
      const promotedRow = readIngestStatusRow(promotedBody)!;

      actOnHumanTask.mockResolvedValue(success);
      fetchIngestStatus.mockResolvedValue(promotedBody);
      useHumanTaskStore.setState({ tasks: [humanTask] });

      render(<IngestStatusCard ingestId={reviewRow.ingest_id} initialRow={reviewRow} pollIntervalMs={30} />);
      fireEvent.click(document.querySelector('[data-ingest-verb="promoted"]')!);
      await waitFor(() => expect(actOnHumanTask).toHaveBeenCalled());

      await waitFor(
        () => expect(document.querySelector("[data-ingest-status]")?.textContent).toBe("promoted"),
        { timeout: 2000 },
      );
      // The ladder draws the row's own stage as `current` — terminal stages included
      // (ingestStageLadder) — and every earlier main-track rung `done`. Asserted rung by rung.
      const ladder = Object.fromEntries(
        Array.from(document.querySelectorAll("[data-ingest-ladder-stage]")).map((el) => [
          el.getAttribute("data-ingest-ladder-stage"),
          el.getAttribute("data-ingest-ladder-state"),
        ]),
      );
      expect(ladder).toEqual({ received: "done", extracting: "done", review: "done", promoted: "current" });
      expect(ingestPollingDone(promotedRow)).toBe(true);

      // polling stops: exactly one fetch (the single successful poll that reached promoted),
      // never a second — give it another couple of intervals to prove no further call happens.
      const callsAtPromoted = fetchIngestStatus.mock.calls.length;
      await new Promise((r) => setTimeout(r, 150));
      expect(fetchIngestStatus.mock.calls.length).toBe(callsAtPromoted);

      // row.detail IS "record <record_id>" on the wire, but the card draws detail ONLY for
      // rejected/failed (IngestStatusCard.tsx's existing rule) — NOT promoted. Reported, not
      // added: no [data-ingest-detail] is drawn here.
      expect(promotedRow.detail).toBe(`record ${fixture.recordId}`);
      expect(document.querySelector("[data-ingest-detail]")).toBeNull();
    });
  });

  describe("B4 — the label, before and after promotion", () => {
    const before = hop(fixture, "6a-provenance-floor-before").response.body;
    const after = hop(fixture, "6b-provenance-floor-after").response.body;

    it("before: draws the unverified warning naming the ingest", () => {
      const { container } = render(<ProvenanceFloorLabel component={before} />);
      expect(container.querySelector("[data-provenance-floor-unverified]")).toBeTruthy();
      expect(container.querySelector(`[data-provenance-floor-ingest-id="${seed.ingestId}"]`)).toBeTruthy();
    });

    it("after: draws NOT the per-ingest warning (provenanceFloorIsUnverified's own rule — ingest_ids AND unidentified)", () => {
      const floor = readProvenanceFloor(after)!;
      expect(provenanceFloorIsUnverified(floor)).toBe(false);
      const { container } = render(<ProvenanceFloorLabel component={after} />);
      expect(container.querySelector("[data-provenance-floor-unverified]")).toBeNull();
      expect(container.querySelector('[data-provenance-floor="user-drop"]')).toBeTruthy();
    });

    it("obtained_via is the same rung both times — promotion never changes it", () => {
      const beforeFloor = readProvenanceFloor(before)!;
      const afterFloor = readProvenanceFloor(after)!;
      expect(beforeFloor.obtained_via).toBe("user-drop");
      expect(afterFloor.obtained_via).toBe("user-drop");
    });
  });

  describe("P4 redproof target — 4a's missing-field list, checked against PAYLOAD_FIELDS transcribed independently", () => {
    // src/iagent/promotion.py@06b81540:69-70's PAYLOAD_FIELDS tuple, transcribed HERE, separately
    // from src/lib/ingestPcn26117Fixture.ts's own PAYLOAD_FIELDS_TRANSCRIBED export — so a mutant
    // that reorders or drops a field INSIDE the fixture (its computation or the literal hop body)
    // is still caught: this expectation does not share that source.
    const PAYLOAD_FIELDS_FROM_PROMOTION_PY = [
      "ingest_id",
      "object_ref",
      "content_kind",
      "pipeline_version",
      "format_fingerprint",
      "standing",
      "extraction_ref",
    ];
    // The 3-key payload gateway.py@06b81540:9006-9007 actually writes carries only `ingest_id`
    // among the seven PAYLOAD_FIELDS.
    const PRESENT_ON_THE_3KEY_PAYLOAD = new Set(["ingest_id"]);

    it("the refusal's message lists exactly PAYLOAD_FIELDS minus ingest_id, in PAYLOAD_FIELDS order", () => {
      const expectedMissing = PAYLOAD_FIELDS_FROM_PROMOTION_PY.filter((f) => !PRESENT_ON_THE_3KEY_PAYLOAD.has(f));
      const expectedRepr = `[${expectedMissing.map((f) => `'${f}'`).join(", ")}]`;
      const expectedMessage =
        `the task payload is missing ${expectedRepr}; each is a field of the decision record, ` +
        `and a record that cannot say what was reviewed is not evidence`;

      const refusal = hop(fixture, "4a-act-refused-422").response.body as { error: string; message: string };
      expect(refusal.error).toBe("promotion_payload_invalid");
      expect(refusal.message).toBe(expectedMessage);
    });
  });
});
