/**
 * WHICH OF THREE SHAPES A KNOWLEDGE_DOCUMENT ARRIVED IN — decided here, drawn in
 * `SemanticInterpreter.tsx`.
 *
 * Until engine-docs, every KNOWLEDGE_DOCUMENT was one string: `markdown_content`. engine-docs
 * (`mesh:explain`, invincible-agent `agent_fleet/docs_agent/explain.py` + `main.py:360-370`) sends
 * two more, and neither has a `markdown_content` of its own:
 *
 *   answer   `{subject, pages: [{title, audience_hint, cited_seals, body, ...}], page_count}`
 *   abstain  `{subject, abstained: true, reason, body: "No page in the corpus explains <subject> yet. ..."}`
 *
 * The platform's deterministic document projector builds `markdown_content` from `summary` and
 * `structured_data`, finds neither on these, and writes "No content available." — so the page
 * that WAS found, or the gap that was honestly named, reached the reader as a malfunction. The
 * docs walk sheet counts both as defects (`docs/measurements/docs-walk-sheet.md`: the body is
 * the page whole, and an abstain names its subject).
 *
 * ⛔ STRUCTURE WINS OVER THE STRING. When `pages` or `abstained` is present, `markdown_content`
 * is ignored even when non-empty, because the one this lane has seen next to them is the
 * projector's placeholder. The string is still honoured when nothing structured arrived, which
 * is every KNOWLEDGE_DOCUMENT that is not a docs answer.
 */

export interface DocPageView {
  title: string | undefined;
  /** DISPLAY ROUTING, NOT AUTHZ — who the page was written for. Shown, never used to hide. */
  audience: string | undefined;
  /** In the PAGE'S order (`explain.cited_seals` keeps first appearance, deliberately unsorted). */
  citedSeals: string[];
  /**
   * The corpus file's leading `---` block, verbatim (lines strictly between the fences), or
   * undefined when the body has none. Never parsed.
   */
  properties: string | undefined;
  /** The page after the front matter, otherwise whole. Never truncated or summarised here. */
  body: string;
}

const FENCE = /^---[ \t\r]*$/;

/**
 * INTERIM until the page arrives as `sections[]`: a corpus file leads with a YAML block whose
 * `#` comment lines react-markdown would draw as h1 and whose closing fence as a setext
 * heading. Front matter exists only when the FIRST line is a fence and a LATER line is one.
 * The block is split off verbatim — no YAML parse, no line dropped or reordered.
 */
export function splitFrontMatter(body: string): { properties: string | undefined; body: string } {
  const lines = body.split("\n");
  if (lines.length < 2 || !FENCE.test(lines[0])) return { properties: undefined, body };
  const close = lines.findIndex((l, i) => i > 0 && FENCE.test(l));
  if (close < 0) return { properties: undefined, body };
  return { properties: lines.slice(1, close).join("\n"), body: lines.slice(close + 1).join("\n") };
}

export type KnowledgeDocumentView =
  | { kind: "pages"; subject: string | undefined; pages: DocPageView[]; declaredCount: number | undefined }
  | { kind: "abstain"; subject: string | undefined; body: string }
  | { kind: "markdown"; subject: string | undefined; content: string };

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function knowledgeDocumentView(comp: any): KnowledgeDocumentView {
  const subject = str(comp?.subject) ?? str(comp?.subject_concept);

  if (Array.isArray(comp?.pages) && comp.pages.length > 0) {
    return {
      kind: "pages",
      subject,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages: comp.pages.map((p: any) => ({
        title: str(p?.title) ?? str(p?.page_iri),
        audience: str(p?.audience_hint),
        citedSeals: Array.isArray(p?.cited_seals) ? p.cited_seals.filter((s: unknown) => typeof s === "string") : [],
        ...splitFrontMatter(str(p?.body) ?? ""),
      })),
      // COMPLETENESS TRAVELS. `page_count` is the engine's statement of how many pages tied;
      // it is kept so the card can say so when fewer arrived than were counted.
      declaredCount: typeof comp?.page_count === "number" ? comp.page_count : undefined,
    };
  }

  if (comp?.abstained === true) {
    // The engine's sentence is shown as written. Only if it is missing is one composed, and
    // then from the two values the engine did send — the subject and the reason — so an abstain
    // still names what it could not explain instead of degrading to an empty card.
    const body =
      str(comp.body) ||
      `No page explains ${subject ?? "this subject"} yet${str(comp.reason) ? ` (${comp.reason})` : ""}.`;
    return { kind: "abstain", subject, body };
  }

  return { kind: "markdown", subject: str(comp?.subject_concept), content: str(comp?.markdown_content) ?? "" };
}
