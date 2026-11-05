/**
 * DOC PAGE FRONT MATTER — a corpus file's leading `---` block is drawn as body text, never as
 * headings. The YAML `#` comment lines would otherwise render as h1 (and the closing fence as a
 * setext heading). Interim until the page arrives as `sections[]`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MarkdownRenderer } from "./Card";
import { splitFrontMatter } from "./knowledgeDocumentView";

afterEach(cleanup);

const COMMENT = "# The concepts this primer explains — each edge points at the IRI that DELIVERS";
const PRIMER = [
  "---",
  "iri: docs:cortex-capabilities-primer",
  COMMENT,
  "explains:",
  "  - mesh:LineageTopology",
  "---",
  "# Real title",
  "",
  "Some prose.",
].join("\n");

const draw = (body: string) =>
  render(<MarkdownRenderer pages={[{ title: "P", body }]} page_count={1} />).container;
const headings = (c: HTMLElement) => Array.from(c.querySelectorAll("h1,h2")).map((h) => h.textContent ?? "");

describe("Doc Page front matter drawn as body text", () => {
  it("primer-shaped: comment lines are not headings; properties are plain text; the real title is h1", () => {
    const c = draw(PRIMER);
    expect(headings(c).filter((t) => t.includes("The concepts this primer explains")),
      "front-matter comment drew as a heading").toEqual([]);
    const props = c.querySelector("[data-doc-properties]");
    expect(props, "no [data-doc-properties] element").not.toBeNull();
    expect(props!.textContent).toContain("iri: docs:cortex-capabilities-primer");
    expect(props!.textContent).toContain(COMMENT);
    expect(Array.from(c.querySelectorAll("h1")).map((h) => h.textContent), "real title is not an h1").toContain("Real title");
  });

  it("the word count is the page as served: front matter is drawn differently, not dropped", () => {
    const c = draw(PRIMER);
    // Every word between and after the fences; the two `---` fences are words to a \s+ split too.
    const served = PRIMER.split(/\s+/).filter((w) => w.length > 0).length - 2;
    expect(c.textContent, "the word count left the front matter out").toContain(`${served} words`);
  });

  it("unclosed front matter: no properties element, behaviour as before", () => {
    const c = draw(["---", COMMENT, "# Real title"].join("\n"));
    expect(c.querySelector("[data-doc-properties]"), "unclosed block was treated as front matter").toBeNull();
    expect(headings(c).some((t) => t.includes("The concepts this primer explains")),
      "comment no longer renders where it did").toBe(true);
  });

  it("no front matter: no properties element", () => {
    expect(draw("# Title\n\nbody").querySelector("[data-doc-properties]")).toBeNull();
  });

  it("a mid-page --- is a thematic break, not front matter", () => {
    const c = draw("# Title\n\nabove\n\n---\n\nbelow\n\n---\n");
    expect(c.querySelector("[data-doc-properties]"), "mid-page --- treated as front matter").toBeNull();
    expect(c.querySelectorAll("hr").length).toBeGreaterThan(0);
  });

  it("CRLF body works", () => {
    const c = draw(PRIMER.replace(/\n/g, "\r\n"));
    expect(c.querySelector("[data-doc-properties]")?.textContent, "CRLF front matter not split").toContain("iri: docs:cortex-capabilities-primer");
    expect(headings(c).filter((t) => t.includes("The concepts"))).toEqual([]);
  });
});

describe("splitFrontMatter", () => {
  it("splits verbatim between the fences", () => {
    expect(splitFrontMatter("---\na: 1\n# c\n---\nrest\nmore")).toEqual({ properties: "a: 1\n# c", body: "rest\nmore" });
  });
  it("unclosed: unchanged", () => {
    const b = "---\na: 1\nrest";
    expect(splitFrontMatter(b)).toEqual({ properties: undefined, body: b });
  });
  it("first line not a fence: unchanged", () => {
    const b = "x\n---\na\n---\n";
    expect(splitFrontMatter(b)).toEqual({ properties: undefined, body: b });
  });
  it("tolerates trailing spaces and CR on fences", () => {
    expect(splitFrontMatter("---  \r\na\r\n---\r\nb").properties).toBe("a\r");
  });
  it("a longer rule (----) is not a fence", () => {
    const b = "----\na\n----\n";
    expect(splitFrontMatter(b).properties).toBeUndefined();
  });
  it("empty and single-line bodies", () => {
    expect(splitFrontMatter("")).toEqual({ properties: undefined, body: "" });
    expect(splitFrontMatter("---")).toEqual({ properties: undefined, body: "---" });
  });
});
