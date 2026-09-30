/**
 * ENGINE-DOCS ON THE CARD, ON THE FLEET'S OWN BYTES — roll #8 (helm revision 159).
 *
 * `sessions/2026-09-30-payload-docs-add-an-engine-roll-8.json` was fired by this lane at the
 * deployed fleet, asked as the census asks (agent-user / DATA_ENGINEER / [DOCS], "how do I add an
 * engine"). Lane 1's passthrough (ab9b2a4e) put `subject`, `pages` and `page_count` BESIDE the
 * placeholder `markdown_content: "No content available."`. This seal renders that component through
 * the interpreter the app ships and holds the card to the walk sheet's bar: the page drawn WHOLE,
 * seals in the page's order, and never the placeholder.
 *
 * `docsExplanation.test.tsx` holds the same claims on hand-built shapes. This file is the one that
 * goes red if the producer's real shape drifts away from them.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "./SemanticInterpreter";

afterEach(cleanup);

const PLACEHOLDER = "No content available.";
const capture = JSON.parse(
  readFileSync(path.join(__dirname, "../../../sessions/2026-09-30-payload-docs-add-an-engine-roll-8.json"), "utf8"),
) as { fleet_sha: string; helm_revision: number; raw_events: { event?: string; data?: { components?: Record<string, unknown>[] } }[] };

interface Page { title: string; body: string; cited_seals: string[]; audience_hint: string }

function theDoc(): Record<string, unknown> {
  const finals = capture.raw_events.filter((e) => e.event === "final_payload");
  expect(finals, "final_payload events").toHaveLength(1);
  const docs = (finals[0].data?.components ?? []).filter((c) => c.archetype === "KNOWLEDGE_DOCUMENT");
  expect(docs, "KNOWLEDGE_DOCUMENT components").toHaveLength(1);
  return docs[0];
}

const MARKUP = ["*", "[", "]", "|", "<", ">", "_", String.fromCharCode(92)];
/** Body lines that render as their own text: prose, markup-free once inline code is unwrapped. */
function proseLines(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => /^[A-Za-z]/.test(l))
    .map((l) => l.split("`").join(""))
    .filter((l) => l.length > 40 && !MARKUP.some((m) => l.includes(m)));
}

describe("the capture is roll #8's, and it carries the structure beside the placeholder", () => {
  it("was captured from revision 159 at ab9b2a4e", () => {
    expect(capture.fleet_sha).toBe("ab9b2a4e");
    expect(capture.helm_revision).toBe(159);
  });

  it("has one page, a count that agrees, and the placeholder still in markdown_content", () => {
    const doc = theDoc();
    expect(Array.isArray(doc.pages)).toBe(true);
    expect((doc.pages as Page[]).length).toBe(1);
    expect(doc.page_count).toBe(1);
    expect(doc.markdown_content).toBe(PLACEHOLDER);
  });
});

describe("the card draws the page the fleet sent", () => {
  it("draws the page, not the placeholder", () => {
    const c = render(<SemanticInterpreter payload={{ components: [theDoc()] }} />).container;
    expect(c.querySelector("[data-doc-pages]")?.getAttribute("data-doc-pages")).toBe("1");
    expect(c.querySelector("[data-doc-page-count-mismatch]")).toBeNull();
    expect(c.textContent).not.toContain(PLACEHOLDER);
    expect(c.querySelector("h3")?.textContent).toBe((theDoc().pages as Page[])[0].title);
  });

  it("draws the body WHOLE — every prose line, first to last, of a 77k page", () => {
    const page = (theDoc().pages as Page[])[0];
    const lines = proseLines(page.body);
    // The floor is the instrument: a filter that matched nothing would pass this vacuously.
    expect(lines.length, "prose lines the check can see").toBeGreaterThan(100);
    const text = render(<SemanticInterpreter payload={{ components: [theDoc()] }} />).container.textContent ?? "";
    const missing = lines.filter((l) => !text.includes(l));
    expect(missing, "prose lines absent from the card").toEqual([]);
  });

  it("lists every cited seal in the page's order, and names the audience", () => {
    const page = (theDoc().pages as Page[])[0];
    expect(page.cited_seals.length).toBeGreaterThan(1);
    const c = render(<SemanticInterpreter payload={{ components: [theDoc()] }} />).container;
    const seals = [...c.querySelectorAll("[data-doc-cited-seals] li")].map((li) => li.textContent);
    expect(seals).toEqual(page.cited_seals.map((s) => "Seal: " + s));
    expect(c.querySelector("[data-doc-audience]")?.textContent).toContain(page.audience_hint);
  });
});
