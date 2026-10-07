/**
 * Seal against Lane 1's live capture of the deployed ingest wire —
 * `sessions/2026-10-01-payload-ingest-drop-roll-11.json`, four exchanges against the gateway at
 * producer 0f48fe2f / helm rev 162. Loaded with `readFileSync` + `JSON.parse`, never inlined —
 * same discipline as `ingestWire.test.ts`'s rev-162 refusal fixture.
 *
 * This capture is what broke two coincidence defects every earlier fixture (hand-built to the
 * sha256 shape) could not reach: a DUPLICATE's `ingest_id` is a uuid, not `sha256:<64 hex>`
 * (exchanges [2]/[3]); and `created_at`/`updated_at` are epoch-ms NUMBERS, not ISO strings
 * (exchanges [1]/[3]). See `ingestWire.ts`'s `readIngestStatusRow`/`readIngestUploadId` for the
 * fix and `ingestWire.test.ts` for the general near-side reader cases.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import {
  readIngestStatusRow,
  readIngestUploadId,
  ingestPollingDone,
  ingestStatusPath,
  readActRefusal,
  readProvenanceFloor,
  provenanceFloorIsUnverified,
} from "./ingestWire";
import { IngestStatusCard } from "@/components/ingest/IngestStatusCard";
import { buildPcn26117Fixture, type Pcn26117Seed } from "./ingestPcn26117Fixture";

interface IngestExchange {
  request: { method: string; path: string };
  response: { status: number; body: unknown };
}

interface IngestCapture {
  captured_by: string;
  file: string;
  exchanges: IngestExchange[];
}

function loadCapture(): IngestCapture {
  const file = path.join(__dirname, "../../sessions/2026-10-01-payload-ingest-drop-roll-11.json");
  return JSON.parse(readFileSync(file, "utf8")) as IngestCapture;
}

const SHA_INGEST_ID =
  "sha256:736499f2eebb7dece392ad285e1a5b03e49e50a88a069cb0cc820b91dc4149d9";
const DUP_INGEST_ID = "7288a292-7642-4cca-bb77-fb77fa7f2689";

describe("ingest roll-11 capture — the deployed gateway's actual wire", () => {
  const capture = loadCapture();

  it("has the four exchanges this seal reads", () => {
    expect(capture.exchanges).toHaveLength(4);
  });

  it("[0] POST /ingest (new arrival) — readIngestUploadId reads the sha id", () => {
    const body = capture.exchanges[0].response.body;
    expect(readIngestUploadId(body)).toBe(SHA_INGEST_ID);
  });

  it("[1] GET /ingest/{sha}/status — readIngestStatusRow reads it, received, still polling, numeric created_at", () => {
    const body = capture.exchanges[1].response.body;
    const row = readIngestStatusRow(body);
    expect(row).not.toBeNull();
    expect(row?.stage).toBe("received");
    expect(ingestPollingDone(row!)).toBe(false);
    expect(typeof row?.created_at).toBe("number");
  });

  it("[2] POST /ingest (duplicate arrival) — readIngestUploadId reads the UUID, not the sha form", () => {
    const body = capture.exchanges[2].response.body;
    expect(readIngestUploadId(body)).toBe(DUP_INGEST_ID);
  });

  it("[3] GET /ingest/{uuid}/status — readIngestStatusRow reads it, duplicate points at exchange [0]'s id, polling done", () => {
    const body = capture.exchanges[3].response.body;
    const row = readIngestStatusRow(body);
    expect(row).not.toBeNull();
    expect(row?.duplicate?.of_ingest_id).toBe(SHA_INGEST_ID);
    expect(ingestPollingDone(row!)).toBe(true);
  });

  describe("ingestStatusPath — the path fetchIngestStatus actually sends", () => {
    it("for [3]'s uuid, equals the captured request path exactly", () => {
      expect(ingestStatusPath(DUP_INGEST_ID)).toBe(capture.exchanges[3].request.path);
    });

    it("for [1]'s sha id, decodes back to the captured path — the gateway answers 200 for %3A", () => {
      const built = ingestStatusPath(SHA_INGEST_ID);
      expect(decodeURIComponent(built)).toBe(capture.exchanges[1].request.path);
    });
  });

  describe("IngestStatusCard — rendering the [3] duplicate row", () => {
    it("draws the duplicate message and of_ingest_id, with NO ladder", () => {
      const row = readIngestStatusRow(capture.exchanges[3].response.body)!;
      const { container } = render(
        <IngestStatusCard ingestId={row.ingest_id} initialRow={row} pollIntervalMs={100000} />,
      );
      expect(container.querySelector("[data-ingest-duplicate]")?.textContent).toContain(
        "already processed",
      );
      expect(container.querySelector("[data-ingest-duplicate]")?.textContent).toContain(
        SHA_INGEST_ID,
      );
      expect(container.querySelector("[data-ingest-ladder]")).toBeNull();
    });
  });
});

/**
 * Lane 1's END-TO-END captures of the live pipeline, generalised over BOTH releases the stall
 * has now been witnessed at:
 *   - helm rev 164 / fleet d602d490: `sessions/2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json`
 *   - helm rev 171 / fleet 4c3b61a6: `sessions/2026-10-04-payload-ingest-pcn23-002-stops-at-received-rev-171.json`
 * Same arms, same `todo`s, run with `describe.each` — THE STALL REPRODUCES AT REV 171 / FLEET
 * 4c3b61a6, not just at the rev this file originally caught it at. Each: one fresh drop, polled
 * for 600+ s. Neither left `received`, and no document_promotion task named either drop on
 * either queue — each capture's own `stopped_at` says so. So the hops that exist are sealed here,
 * and the promote response and the label are `todo`, NOT green: there is nothing on the wire yet
 * for them to read. When Lane 1 replaces either capture with one that progresses, the stall arm
 * below goes red for that release and says so.
 */
interface E2eHop {
  request?: { method?: string; path?: string };
  response?: {
    status?: number;
    body?: unknown;
    rows_total?: number;
    rows_naming_this_ingest_or_promotion?: unknown;
  };
}
interface E2eCapture {
  release: string;
  hops: E2eHop[];
  ingest_id: string;
  stages_seen: string[];
  stopped_at: string;
}

const E2E_CAPTURES = [
  { label: "rev-164 / fleet d602d490", file: "2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json" },
  { label: "rev-171 / fleet 4c3b61a6", file: "2026-10-04-payload-ingest-pcn23-002-stops-at-received-rev-171.json" },
];

describe.each(E2E_CAPTURES)("ingest end-to-end capture ($label) — what the live pipeline did with one drop", ({ file }) => {
  const e2e = JSON.parse(
    readFileSync(path.join(__dirname, "../../sessions", file), "utf8"),
  ) as E2eCapture;
  const statusHops = e2e.hops.filter(
    (h) => h.request?.method === "GET" && /^\/ingest\/.+\/status$/.test(h.request?.path ?? ""),
  );
  const promotionHops = e2e.hops.filter((h) => h.request?.path === "/me/human_tasks");

  it("the upload hop reads through readIngestUploadId as the capture's ingest_id", () => {
    const upload = e2e.hops.find((h) => h.request?.method === "POST" && h.request?.path === "/ingest");
    expect(upload, "no POST /ingest hop in the capture").toBeTruthy();
    expect(readIngestUploadId(upload!.response?.body)).toBe(e2e.ingest_id);
  });

  it("EVERY status hop reads through readIngestStatusRow, and ingestStatusPath reproduces its path", () => {
    expect(statusHops.length).toBeGreaterThanOrEqual(2);
    for (const h of statusHops) {
      const row = readIngestStatusRow(h.response?.body);
      expect(row, `status row refused: ${JSON.stringify(h.response?.body).slice(0, 200)}`).not.toBeNull();
      expect(row!.ingest_id).toBe(e2e.ingest_id);
      expect(decodeURIComponent(ingestStatusPath(row!.ingest_id))).toBe(h.request!.path);
    }
  });

  it("the stall, as captured: every stage seen is `received`, and the card keeps polling rather than calling it done", () => {
    expect(e2e.stages_seen).toEqual(["received"]);
    for (const h of statusHops) {
      const row = readIngestStatusRow(h.response?.body)!;
      expect(row.stage).toBe("received");
      expect(ingestPollingDone(row)).toBe(false);
    }
    expect(e2e.stopped_at).toContain("no document_promotion task");
  });

  it("no /me/human_tasks row names this ingest or its promotion, for every caller polled", () => {
    // Both hops 3/4 (one per caller) are `/me/human_tasks` summaries,
    // `{status, rows_total, rows_naming_this_ingest_or_promotion}`, with no row body — inspected
    // as captured, not assumed. This is the stall itself: zero named rows on either queue.
    expect(promotionHops.length, "no /me/human_tasks hop in the capture").toBeGreaterThan(0);
    for (const h of promotionHops) {
      const rows = h.response?.rows_naming_this_ingest_or_promotion;
      if (Array.isArray(rows)) {
        expect(rows.length).toBe(0);
      } else {
        expect(rows).toBe(0);
      }
    }
  });

  // Neither release's OWN capture has a promote response or a label yet — the stall arm above
  // says so (`stages_seen` never leaves `received`). `src/lib/ingestPcn26117Fixture.ts` builds
  // both from invincible-agent producer source at fleet 06b81540 (a DIFFERENT ingest, PCN26-117,
  // not this release's drop) so there is something real to read against in the meantime. These
  // two arms are real, not todo, but over THAT fixture — see
  // `src/components/ingest/ingestPromotionFixture.test.tsx` for the full component-level seal.
  it("promote response — not witnessed by this release's own capture; the built PCN26-117 fixture's refusal/success read as real shapes", () => {
    const seed: Pcn26117Seed = {
      ingestId: "sha256:b58ec2f6e0438479eea35715a060d9686a8e3efa49803202c15f18dde9f0745c",
      sha256: "b58ec2f6e0438479eea35715a060d9686a8e3efa49803202c15f18dde9f0745c",
      kind: "pdf",
      droppedBy: { authz_id: "alice@example.com" },
      createdAt: 1791310971294,
    };
    const fixture = buildPcn26117Fixture(seed);
    const refused = fixture.hops.find((h) => h.id === "4a-act-refused-422")!;
    const refusal = readActRefusal({ response: { status: 422, data: { detail: refused.response.body } } });
    expect(refusal?.error).toBe("promotion_payload_invalid");
    expect(refusal?.message).toBe(fixture.refusalMessage);
  });

  it("label — not witnessed by this release's own capture; the built PCN26-117 fixture's floor reads unverified before, not after", () => {
    const seed: Pcn26117Seed = {
      ingestId: "sha256:b58ec2f6e0438479eea35715a060d9686a8e3efa49803202c15f18dde9f0745c",
      sha256: "b58ec2f6e0438479eea35715a060d9686a8e3efa49803202c15f18dde9f0745c",
      kind: "pdf",
      droppedBy: { authz_id: "alice@example.com" },
      createdAt: 1791310971294,
    };
    const fixture = buildPcn26117Fixture(seed);
    const before = readProvenanceFloor(fixture.hops.find((h) => h.id === "6a-provenance-floor-before")!.response.body);
    const after = readProvenanceFloor(fixture.hops.find((h) => h.id === "6b-provenance-floor-after")!.response.body);
    expect(before && provenanceFloorIsUnverified(before)).toBe(true);
    expect(after && provenanceFloorIsUnverified(after)).toBe(false);
    expect(before?.obtained_via).toBe(after?.obtained_via);
  });

  it.todo(
    "promote 200 — awaits a live promote, blocked on the 3-key payload (promotion_payload_invalid, witnessed rev 175 hop 7)",
  );
  it.todo(
    "label — awaits a live promote, blocked on the 3-key payload (promotion_payload_invalid, witnessed rev 175 hop 7)",
  );
});

/**
 * rev-171 ONLY — fields new at this release. `workflow` and `origin_suggestion` first appear on
 * the POST /ingest response body here; rev-164's equivalent hop has neither key at all (checked
 * by hand: `sessions/2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json` hop "1-ingest"'s body
 * has no `workflow`/`origin_suggestion` keys, present or null).
 *
 * `origin_suggestion` has NO reader anywhere in this repo as of 2026-10-04:
 * `grep -rni "origin_suggestion|originSuggestion|suggestion"` over `src/lib` and
 * `src/components/ingest` finds only `KindPicker.tsx`'s unrelated `suggestedKind` prop — a kind
 * guess `IngestPanel` never actually passes (`KindPicker.tsx:13`), not a reader of this field —
 * and `taskArtifact.ts`'s task-payload `suggestion`, a different field on a different object.
 * So per the spec: no arm is added for behavior that does not exist; `workflow`/`origin_suggestion`
 * are asserted only as values on the wire, not as anything cortex draws.
 */
describe("rev-171 POST /ingest response — the new null fields", () => {
  const e2e = JSON.parse(
    readFileSync(
      path.join(__dirname, "../../sessions/2026-10-04-payload-ingest-pcn23-002-stops-at-received-rev-171.json"),
      "utf8",
    ),
  ) as E2eCapture;
  const upload = e2e.hops.find((h) => h.request?.method === "POST" && h.request?.path === "/ingest")!;
  const body = upload.response?.body as Record<string, unknown>;

  it("carries workflow: null and origin_suggestion: null, and readIngestUploadId still reads the row", () => {
    expect(body.workflow).toBeNull();
    expect(body.origin_suggestion).toBeNull();
    expect(readIngestUploadId(body)).toBe(e2e.ingest_id);
  });
});
