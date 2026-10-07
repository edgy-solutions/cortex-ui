/**
 * ADR-0055 step 2's promise, made checkable: ZERO VISUAL CHANGE across the extraction.
 *
 * `parity.baseline.json` is not generated here — it was generated ONCE, by a throwaway script, at
 * the pre-move HEAD, before `MarkdownRenderer` (KNOWLEDGE_DOCUMENT) became a package. This file
 * re-draws every one of those same payloads through the same real dispatch path
 * (`SemanticInterpreter`, never the bare `MarkdownRenderer` component — the thing under test is
 * the WIRING, registry lookup included, not just the card) and diffs the HTML. A baseline this
 * test could regenerate for itself would only ever agree with whatever the code does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SemanticInterpreter } from "../../components/registry/SemanticInterpreter";
import { KNOWLEDGE_DOCUMENT_FIXTURES } from "./fixtures";
import baseline from "./parity.baseline.json";

afterEach(cleanup);

const SESSIONS = path.join(__dirname, "../../../sessions");

/**
 * The only 2 capture files carrying KNOWLEDGE_DOCUMENT (confirmed via
 * `grep -rl "KNOWLEDGE_DOCUMENT" sessions/*.json`), with two different wire shapes: the
 * np-meridian-brief payload lives at `projected[].payload`, the roll-8 payload lives at
 * `raw_events[].event === "final_payload".data.components[]`.
 */
const PROJECTED_CAPTURE = "2026-09-19-payload-finance-np-meridian-brief.json";
const FINAL_PAYLOAD_CAPTURE = "2026-09-30-payload-docs-add-an-engine-roll-8.json";

function renderFresh(): Record<string, string> {
  const out: Record<string, string> = {};

  for (const f of KNOWLEDGE_DOCUMENT_FIXTURES) {
    const { container } = render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "KNOWLEDGE_DOCUMENT", ...f.payload }] }}
      />,
    );
    out[`fixture:${f.name}`] = container.innerHTML;
    cleanup();
  }

  {
    const data = JSON.parse(
      readFileSync(path.join(SESSIONS, PROJECTED_CAPTURE), "utf8"),
    ) as { projected?: { archetype?: string; payload?: Record<string, unknown> }[] };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "KNOWLEDGE_DOCUMENT" && p.payload);
    for (const { p, i } of matches) {
      const { container } = render(<SemanticInterpreter payload={{ components: [p.payload] }} />);
      out[`capture:${PROJECTED_CAPTURE}#${i}`] = container.innerHTML;
      cleanup();
    }
  }

  {
    const data = JSON.parse(
      readFileSync(path.join(SESSIONS, FINAL_PAYLOAD_CAPTURE), "utf8"),
    ) as { raw_events: { event?: string; data?: { components?: Record<string, unknown>[] } }[] };
    const finals = data.raw_events.filter((e) => e.event === "final_payload");
    const docs = (finals[0]?.data?.components ?? []).filter((c) => c.archetype === "KNOWLEDGE_DOCUMENT");
    docs.forEach((doc, i) => {
      const { container } = render(<SemanticInterpreter payload={{ components: [doc] }} />);
      out[`capture:${FINAL_PAYLOAD_CAPTURE}#${i}`] = container.innerHTML;
      cleanup();
    });
  }

  return out;
}

const BASELINE = baseline as Record<string, string>;

describe("KNOWLEDGE_DOCUMENT parity — the package draws exactly what the pre-move card drew", () => {
  it("every baseline key renders byte-identical HTML today", () => {
    const fresh = renderFresh();
    for (const key of Object.keys(BASELINE)) {
      expect(fresh[key], `${key}: present in the baseline but not in a fresh render`).toBeDefined();
      expect(fresh[key], `${key}: HTML diverged from the pre-move baseline`).toBe(BASELINE[key]);
    }
  });

  it("the key SET matches, counted fresh — an added fixture or capture with no baseline entry is a red", () => {
    const fresh = renderFresh();
    expect(new Set(Object.keys(fresh))).toEqual(new Set(Object.keys(BASELINE)));
  });

  it("the baseline is at least the generation floor — 11 entries (9 fixtures, 2 renderable captures)", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(11);
  });

  it("the fallback route (plain markdown, IRI subject) is in the baseline and renders through the ordinary switch — no registry special-case", () => {
    const key = "fixture:plain markdown — the fallback route, subject is an IRI";
    expect(BASELINE[key]).toBeDefined();
    const fresh = renderFresh();
    expect(fresh[key]).toBe(BASELINE[key]);
  });
});
