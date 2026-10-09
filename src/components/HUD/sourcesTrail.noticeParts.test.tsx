/**
 * Notice-parts sources: "which parts does <notice> affect" answered with each part's URI, mpn
 * (MAY BE ABSENT — the gateway projection drops it), dropped_by, promoted_by and the
 * provenance_floor banner. The fixture is DERIVED, not a capture — see noticePartsSourcesFixture.
 * The arrival arm (f) is what tells us when a capture lands.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SourcesTrail } from "./SourcesTrail";
import { useCanvasStore } from "@/store/useCanvasStore";
import { parseSSE } from "@/api/client";
import { readSourcesProvenance } from "@/lib/sourceProvenance";
import type { Artifact, Source } from "@/api/types";
import {
  NOTICE_PARTS_SOURCES_EVENT,
  NOTICE_PARTS_SOURCES_EVENT_UNPROMOTED,
  NOTICE_PARTS_RAW_SOURCES_WITH_MPN,
  INGEST_ID,
  DROPPED_BY,
  PROMOTED_BY,
} from "@/lib/noticePartsSourcesFixture";

vi.mock("react-oidc-context", () => ({ useAuth: () => ({ isAuthenticated: true, user: { access_token: "t" } }) }));

const store = () => useCanvasStore.getState();
const ID = "np1";

function parse(body: unknown) {
  const ev = parseSSE("sources", JSON.stringify(body));
  if (!ev || ev.type !== "sources") throw new Error("not a sources event");
  return ev;
}

/** The SSE path as the hook runs it. */
function arrive(body: unknown) {
  const ev = parse(body);
  store().createPendingArtifact({
    id: ID,
    message_id: "m1",
    question_text: "which parts does PCN26-182 affect?",
    produced_for: { user_id: "alice", is_authenticated: true, entitlement_source: "none" },
  });
  const sp = readSourcesProvenance(ev.sources, ev.provenance_floor ?? null);
  store().updateArtifact(ID, { source_provenance: sp }, "sse:sources");
  // Electric carries the base Source fields only.
  store().electricUpsertArtifact(electricRow(ev.sources));
}

function electricRow(sources: Source[]): Artifact {
  const base = sources.map((s) => ({
    type: s.type, label: s.label, uri: s.uri, snippet: s.snippet,
  })) as Source[];
  return {
    id: ID, created_at: 1, updated_at: 2, question_text: "q", message_id: "m1",
    status: "complete", sources: base,
  } as unknown as Artifact;
}

const q = (c: HTMLElement, sel: string) => Array.from(c.querySelectorAll(sel));
const vals = (c: HTMLElement, attr: string) =>
  q(c, `[${attr}]`).map((e) => e.getAttribute(attr));

beforeEach(() => store().artifacts.forEach((a) => store().removeArtifact(a.id)));
afterEach(cleanup);

describe("notice-parts sources", () => {
  it("a. the client parse keeps the floor and both sources", () => {
    const ev = parse(NOTICE_PARTS_SOURCES_EVENT);
    expect(ev.provenance_floor).toEqual({ obtained_via: "user-drop", ingest_ids: [], unidentified: 0 });
    expect(ev.sources).toHaveLength(2);
  });

  it("b. promoted: rows, chips, uris and the quiet floor chip", () => {
    arrive(NOTICE_PARTS_SOURCES_EVENT);
    const { container: c } = render(<SourcesTrail />);
    expect(q(c, "[data-source-uri]")).toHaveLength(2);
    expect(q(c, '[data-source-dropped-by="alice@example.com"]')).toHaveLength(2);
    expect(q(c, `[data-source-promoted-by="${PROMOTED_BY}"]`)).toHaveLength(2);
    expect(q(c, "[data-source-mpn]")).toHaveLength(0);
    expect(vals(c, "data-source-uri")).toEqual([
      "http://internal/components/5530-182",
      "http://internal/components/5530-183",
    ]);
    expect(q(c, '[data-provenance-floor="user-drop"]')).toHaveLength(1);
    expect(q(c, "[data-provenance-floor-unverified]")).toHaveLength(0);
    expect(DROPPED_BY).toBe("alice@example.com");
  });

  it("c. mpn present when the wire carries it", () => {
    arrive({ ...NOTICE_PARTS_SOURCES_EVENT, sources: NOTICE_PARTS_RAW_SOURCES_WITH_MPN });
    const { container: c } = render(<SourcesTrail />);
    expect(vals(c, "data-source-mpn")).toEqual(["5530-182", "5530-183"]);
  });

  it("d. unpromoted control names the ingest id and shows no promoter", () => {
    arrive(NOTICE_PARTS_SOURCES_EVENT_UNPROMOTED);
    const { container: c } = render(<SourcesTrail />);
    expect(q(c, "[data-provenance-floor-unverified]")).toHaveLength(1);
    expect(q(c, `[data-provenance-floor-ingest-id="${INGEST_ID}"]`)).toHaveLength(1);
    expect(q(c, "[data-source-promoted-by]")).toHaveLength(0);
    expect(q(c, "[data-source-dropped-by]")).toHaveLength(2);
  });

  it("e. survives an Electric upsert whose sources are base fields only", () => {
    arrive(NOTICE_PARTS_SOURCES_EVENT);
    store().electricUpsertArtifact(electricRow(parse(NOTICE_PARTS_SOURCES_EVENT).sources));
    const { container: c } = render(<SourcesTrail />);
    expect(q(c, "[data-source-dropped-by]")).toHaveLength(2);
    expect(store()._lastUpdateSource[ID].source_provenance).toBe("sse:sources");
  });

  it("f. arrival arm: no notice-parts capture has landed in sessions/*.json", () => {
    const dir = join(process.cwd(), "sessions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(30);
    const isCapture = (v: unknown): boolean => {
      if (Array.isArray(v)) return v.some(isCapture);
      if (typeof v !== "object" || v === null) return false;
      const o = v as Record<string, unknown>;
      if (
        Array.isArray(o.sources) && "provenance_floor" in o &&
        o.sources.some((s) => typeof (s as Source)?.uri === "string" &&
          (s as Source).uri.startsWith("http://internal/components/"))
      ) return true;
      return Object.values(o).some(isCapture);
    };
    const hits = files.filter((f) => {
      try { return isCapture(JSON.parse(readFileSync(join(dir, f), "utf8"))); } catch { return false; }
    });
    expect(hits, "a notice-parts capture landed — seal on it and retire the derived fixture").toEqual([]);
  });
});
