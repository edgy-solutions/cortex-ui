/**
 * Refactor item 5: the rail and the review card read ONE `documents` adapter.
 *  (1) one predicate: the dispatcher's RENDERED card vs `documentReviewIngestId`, and the rail's attach;
 *  (2) one poller; (3) the review card's chip draws the real stage; (4) `ingestInFlight` vs
 *  `ingestPollingDone`; (5) census: no component-side poll, no kind literal in the rail.
 */
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const fetchIngestStatus = vi.fn();
const never = () => new Promise(() => undefined);
vi.mock("@/api/client", () => ({ actOnHumanTask: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  fetchIngestMine: () => Promise.resolve({ items: [], next: null }),
  fetchIngestExtraction: () => never(),
  fetchIngestSource: () => never(),
  correctIngestLeaf: vi.fn(),
}));
vi.mock("@/lib/pdfSource", () => ({ openPdf: () => never(), RenderCancelled: class extends Error {} }));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ user: { profile: { sub: "user-a" } } }) }));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "@/components/ApprovalTask/ApprovalTaskCard";
import { IngestStatusCard } from "@/components/ingest/IngestStatusCard";
import { seedIngestRow } from "@/components/ingest/ingestCardTestKit";
import { documentReviewIngestId } from "@/lib/documents";
import { useIngestArtifactSync } from "@/lib/useIngestArtifactSync";
import { fixturePromotionPayload } from "@/lib/promotionReviewFixture";
import { ingestInFlight } from "@/lib/ingestArtifact";
import {
  INGEST_STAGES,
  INGEST_OOB_DOCUMENT_STATUSES,
  ingestPollingDone,
  type IngestStatusRow,
} from "@/lib/ingestWire";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { INGEST_POLL_MS, useIngestStatusStore } from "@/store/useIngestStatusStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useCanvasStore } from "@/store/useCanvasStore";

const SHA = "5b15f205".padEnd(64, "a");
const ID = `sha256:${SHA}`;
const OTHER = `sha256:${"c0ffee".padEnd(64, "0")}`;

const row = (over: Partial<IngestStatusRow> = {}): IngestStatusRow => ({
  ingest_id: ID, sha256: SHA, kind: "pdf", stage: "review", detail: null, duplicate: null,
  created_at: 1790860800000, updated_at: 1790860800000, case_id: null, ...over,
});
const approval = (kind: string, payload: unknown): ApprovalTaskPayload => ({
  task_id: "t-1", kind, task_state: "pending", title: "T", summary: "S", audience: "a", requested_by: "x",
  subject_ref: null, declaration: { kind, declared: true, archetype: "APPROVAL_TASK", badge: "B", title: "T", accepts: ["promoted", "rejected"], reason_required: ["rejected"] },
  payload,
} as unknown as ApprovalTaskPayload);
const human = (kind: string, payload: unknown, status: HumanTask["status"] = "pending"): HumanTask => ({
  id: "r-1", taskId: "t-1", workflowId: null, audience: "a", kind, status, title: "T", summary: "S",
  requestedBy: "x", subjectRef: null, payload: payload as Record<string, unknown>, createdAt: 0,
});

beforeEach(() => {
  vi.useFakeTimers();
  fetchIngestStatus.mockReset().mockImplementation(async () => row());
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useIngestStatusStore.getState().reset();
  useHumanTaskStore.setState({ tasks: [] });
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
});

// The population: every kind x payload the dispatcher can be handed (no review_shape, which routes elsewhere).
const KINDS = ["document_promotion", "evidence_review", "workflow_ack", "document_empty_confirm", "grouped_review"];
const PAYLOADS: Array<[string, unknown]> = [
  ["ingest_id", { ...fixturePromotionPayload(ID) }],
  ["no ingest_id", { domain: "X" }],
  ["empty ingest_id", { ingest_id: "" }],
  ["numeric ingest_id", { ingest_id: 7 }],
  ["array", [ID]],
  ["null", null],
];

describe("one predicate", () => {
  for (const kind of KINDS) {
    for (const [pname, payload] of PAYLOADS) {
      it(`${kind} x ${pname}: the predicate is non-null iff the dispatcher renders the review card; the rail attaches exactly the pending subset`, () => {
        const { container, unmount } = render(<ApprovalTaskCard task={approval(kind, payload)} />);
        const renders = container.querySelector("[data-promotion-review]") !== null;
        unmount();
        const id = documentReviewIngestId({ kind, payload });
        expect(id !== null).toBe(renders);
        for (const status of ["pending", "approved"] as const) {
          useHumanTaskStore.setState({ tasks: [human(kind, payload, status)] });
          seedIngestRow(row());
          const r = render(<IngestStatusCard ingestId={ID} />);
          const attached = r.container.querySelector("[data-ingest-review]") !== null;
          r.unmount();
          expect(attached).toBe(renders && status === "pending");
        }
      });
    }
  }

  it("the only kind the predicate accepts today is document_promotion, so no other-kind arm exists; the rail file spells no kind literal in code", () => {
    const accepted = KINDS.filter((k) => documentReviewIngestId({ kind: k, payload: { ingest_id: ID } }) !== null);
    expect(accepted).toEqual(["document_promotion"]);
    const src = readFileSync(join(__dirname, "../components/ingest/IngestStatusCard.tsx"), "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(code).not.toMatch(/kind === "document_promotion"/);
    expect(code).not.toMatch(/t\.kind\b/);
  });

  it("a task for another drop does not attach", () => {
    useHumanTaskStore.setState({ tasks: [human("document_promotion", { ingest_id: OTHER })] });
    seedIngestRow(row());
    const r = render(<IngestStatusCard ingestId={ID} />);
    expect(r.container.querySelector("[data-ingest-review]")).toBeNull();
  });
});

function Sync() {
  useIngestArtifactSync();
  return null;
}

describe("one poller", () => {
  it("the rail card and the review card for one ingest_id share ONE fetch per interval", async () => {
    render(
      <>
        <Sync />
        <IngestStatusCard ingestId={ID} />
        <ApprovalTaskCard task={approval("document_promotion", fixturePromotionPayload(ID))} />
      </>,
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // t0: the row was absent, both cards registered it, the poller read it once.
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
    for (let i = 1; i <= 3; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(INGEST_POLL_MS); });
      expect(fetchIngestStatus).toHaveBeenCalledTimes(1 + i); // `review` is not terminal: once per interval, not twice
    }
    expect(useIngestStatusStore.getState().tracked).toEqual([ID]);
  });
});

describe("the review card draws the real stage", () => {
  const verb = () => document.querySelector('[data-promotion-review] [data-leaf-verb="change"]');
  it("a row at promoted locks the chip; before the row is read it draws the review fallback", () => {
    const t = approval("document_promotion", fixturePromotionPayload(ID));
    const a = render(<ApprovalTaskCard task={t} />);
    expect(verb()).not.toBeNull(); // no row: "review", changeable
    a.unmount();
    seedIngestRow(row({ stage: "promoted" }));
    render(<ApprovalTaskCard task={t} />);
    expect(verb()).toBeNull(); // promoted is a LOCKED stage
  });
});

describe("ingestInFlight vs ingestPollingDone", () => {
  const stages = [...INGEST_STAGES, ...INGEST_OOB_DOCUMENT_STATUSES] as unknown as Array<IngestStatusRow["stage"]>;
  it("over every stage and out-of-band status, in flight is exactly the negation of done, both directions", () => {
    expect(stages.length).toBeGreaterThan(6);
    for (const stage of stages) {
      const done = ingestPollingDone({ stage, duplicate: null, failure: null });
      expect(ingestInFlight({ badge: stage as string }), `stage ${stage}`).toBe(!done);
    }
  });
  it("the badges that are not rows are the only difference", () => {
    expect(ingestInFlight({ badge: "uploading" })).toBe(true); // no row yet
    for (const b of ["checking", "error", "duplicate", "not found"]) expect(ingestInFlight({ badge: b })).toBe(false);
  });
});

describe("census: one poller, no component-side poll", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|ingestMock/.test(n)) out.push(p);
    }
    return out;
  };
  const SRC = join(__dirname, "..");
  // Read and comment-strip src/ ONCE: walking it per arm overran the 5s default under full-suite load.
  let code: [string, string][] = [];
  beforeAll(() => {
    code = walk(SRC).map((f) => [
      f.slice(SRC.length + 1).replace(/\\/g, "/"),
      readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
    ]);
  }, 60_000);
  const callers = (name: string) =>
    code
      .filter(([, text]) => new RegExp(`\\b${name}\\(`).test(text))
      .map(([rel]) => rel)
      .sort();

  it("readIngestStatusRow is called only where a row is read: the parser, the store, the leaf chip's POST response", () => {
    expect(callers("readIngestStatusRow")).toEqual(["components/ingest/IngestLeafChip.tsx", "lib/ingestWire.ts", "store/useIngestStatusStore.ts"]);
  });
  it("fetchIngestStatus is called only by the store and the transport", () => {
    expect(callers("fetchIngestStatus")).toEqual(["api/client.ts", "lib/ingestTransport.ts", "store/useIngestStatusStore.ts"]);
  });
});
