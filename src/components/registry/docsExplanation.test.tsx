/**
 * ENGINE-DOCS ON THE CARD — a docs answer draws its page, an abstain draws its sentence, and
 * neither ever reads "No content available".
 *
 * The shapes are the engine's own (invincible-agent `agent_fleet/docs_agent/explain.py`,
 * `main.py:360-370`). The walk sheet's bar (`docs/measurements/docs-walk-sheet.md`): the body
 * is the page WHOLE, cited seals keep the page's order, and an abstain names its subject.
 *
 * ⛔ THE PLACEHOLDER IS IN THE FIXTURES ON PURPOSE. The platform's projector writes
 * `markdown_content: "No content available."` beside whatever else it passes through, so the
 * payload this card must survive carries BOTH. A fixture without the placeholder would pass
 * against a card that still preferred the string.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "./SemanticInterpreter";
import { MARKDOWN_RENDERER_CONTRACT } from "./MarkdownRenderer.contract";
import { knowledgeDocumentView } from "./knowledgeDocumentView";

afterEach(cleanup);

const PLACEHOLDER = "No content available.";

const RUNBOOK_BODY = [
  "# Rolling the frontend",
  "",
  "Pin by digest, never by tag.",
  "",
  "1. Read the digest from the registry.",
  "2. Render the chart with the pin and nothing else.",
  "",
  "The render arm is `tests/chart/test_render.py`, then `tests/chart/test_pin.py`.",
  "",
  "Last paragraph: the kubelet is where a bad tag finally fails.",
].join("\n");

const page = (over: Record<string, unknown> = {}) => ({
  archetype: "KNOWLEDGE_DOCUMENT",
  page_iri: "http://invincible-agent/docs#page/roll-frontend",
  title: "Rolling the frontend",
  doc_kind: "runbook",
  audience_hint: "PLATFORM_OPERATOR",
  explains: ["http://invincible-agent/mesh#FrontendRoll"],
  // THE PAGE'S ORDER, which is NOT alphabetical — sorting would reorder it and this would see it.
  cited_seals: ["tests/chart/test_render.py", "tests/chart/test_pin.py"],
  source: "docs/runbooks/roll-frontend.md",
  body_sha: "0".repeat(64),
  body: RUNBOOK_BODY,
  ...over,
});

const answer = (pages: unknown[], over: Record<string, unknown> = {}) => ({
  archetype: "KNOWLEDGE_DOCUMENT",
  subject: "http://invincible-agent/mesh#FrontendRoll",
  pages,
  page_count: pages.length,
  markdown_content: PLACEHOLDER,
  ...over,
});

const SUBJECT = "http://invincible-agent/mesh#WarpDrive";
const ABSTAIN_SENTENCE =
  `No page in the corpus explains ${SUBJECT} yet. That is a gap in the documentation, not a failure of the question.`;
const abstain = (over: Record<string, unknown> = {}) => ({
  archetype: "KNOWLEDGE_DOCUMENT",
  page_iri: null,
  subject: SUBJECT,
  abstained: true,
  reason: "no_page_explains_this_subject",
  body: ABSTAIN_SENTENCE,
  markdown_content: PLACEHOLDER,
  ...over,
});

const draw = (comp: unknown) =>
  render(<SemanticInterpreter payload={{ components: [comp] }} />).container;

describe("a docs answer renders its page", () => {
  it("the body is drawn WHOLE — every line of the page, first to last", () => {
    const c = draw(answer([page()]));
    const text = c.textContent ?? "";
    for (const line of ["Rolling the frontend", "Pin by digest, never by tag.", "Read the digest from the registry.",
      "Render the chart with the pin and nothing else.", "Last paragraph: the kubelet is where a bad tag finally fails."]) {
      expect(text, line).toContain(line);
    }
    expect(text).not.toContain(PLACEHOLDER);
  });

  it("the heading is the page's title, and its audience is shown as routing, not used to hide", () => {
    const c = draw(answer([page()]));
    expect(c.querySelector("h3")?.textContent).toBe("Rolling the frontend");
    expect(c.querySelector("[data-doc-audience]")?.textContent).toContain("PLATFORM_OPERATOR");
  });

  it("cited seals appear in the PAGE'S order, not sorted", () => {
    const c = draw(answer([page()]));
    const seals = [...c.querySelectorAll("[data-doc-cited-seals] li")].map((li) => li.textContent);
    expect(seals).toEqual(["Seal: tests/chart/test_render.py", "Seal: tests/chart/test_pin.py"]);
  });

  it("EVERY tied page is drawn, in order — one shape, always a list", () => {
    const c = draw(answer([
      page(),
      page({ title: "Why digests", body: "A tag can move; a digest cannot.", cited_seals: [] }),
    ]));
    expect(c.querySelector("[data-doc-pages]")?.getAttribute("data-doc-pages")).toBe("2");
    expect([...c.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Rolling the frontend", "Why digests"]);
    expect(c.textContent).toContain("A tag can move; a digest cannot.");
    expect(c.textContent).not.toContain(PLACEHOLDER);
  });

  it("fewer pages than the engine counted is SAID, not silently drawn short", () => {
    const c = draw(answer([page()], { page_count: 3 }));
    expect(c.querySelector("[data-doc-page-count-mismatch]")?.textContent).toMatch(/1 of 3 pages arrived/i);
  });

  it("an agreeing count draws no mismatch — the near side of that branch", () => {
    const c = draw(answer([page()]));
    expect(c.querySelector("[data-doc-page-count-mismatch]")).toBeNull();
  });
});

describe("an abstain renders the sentence", () => {
  it("the engine's sentence is drawn as written, naming the subject — never the placeholder", () => {
    const c = draw(abstain());
    expect(c.querySelector("[data-doc-abstained]")).not.toBeNull();
    expect(c.textContent).toContain(`No page in the corpus explains ${SUBJECT} yet.`);
    expect(c.textContent).not.toContain(PLACEHOLDER);
  });

  it("the heading is the subject's local name, not the IRI", () => {
    const c = draw(abstain());
    expect(c.querySelector("h3")?.textContent).toBe("Warp Drive");
  });

  it("an abstain whose sentence went missing still names its subject and reason", () => {
    const c = draw(abstain({ body: undefined }));
    expect(c.textContent).toContain(SUBJECT);
    expect(c.textContent).toContain("no_page_explains_this_subject");
    expect(c.textContent).not.toContain(PLACEHOLDER);
  });
});

describe("everything that is not a docs answer is untouched", () => {
  it("POSITIVE CONTROL: plain markdown_content still draws — the placeholder is shown when it is all there is", () => {
    // If this went red, the card had stopped drawing markdown_content at all, and every
    // assertion above about what is NOT on screen would be passing for the wrong reason.
    const c = draw({ archetype: "KNOWLEDGE_DOCUMENT", subject_concept: "Plain", markdown_content: PLACEHOLDER });
    expect(c.textContent).toContain(PLACEHOLDER);
  });

  it("an EMPTY pages list is not an answer — the string is honoured", () => {
    expect(knowledgeDocumentView({ pages: [], markdown_content: "x" }).kind).toBe("markdown");
  });

  it("abstained must be literally true — a truthy string does not flip the card", () => {
    expect(knowledgeDocumentView({ abstained: "false", markdown_content: "x" }).kind).toBe("markdown");
  });
});

describe("the contract names every field the card now reads", () => {
  it("engine-docs fields are declared, optional, and the refusal vocabulary stays empty", () => {
    const f = MARKDOWN_RENDERER_CONTRACT.fields;
    for (const k of ["subject", "pages", "page_count", "abstained", "reason", "body"] as const) {
      expect(f[k], k).toBeDefined();
      expect(f[k].required, k).toBe(false);
    }
    expect(MARKDOWN_RENDERER_CONTRACT.refusalReasons).toEqual([]);
  });
});
