/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `KNOWLEDGE_DOCUMENT`.
 *
 * Each fixture is a full `comp`-shaped payload (never a bare `markdown_content` string) because
 * the card's own routing — `knowledgeDocumentView` — reads the whole thing to pick a shape.
 * `markdown_content` carries the platform's deterministic placeholder ("No content available.")
 * beside the structured fields on every pages/abstain fixture, exactly as the real producer
 * sends it (see `Card.tsx`'s and `knowledgeDocumentView.ts`'s module docstrings): a fixture
 * without the placeholder would pass against a card that still preferred the string.
 */

export const KNOWLEDGE_DOCUMENT_ABSENCES = [
  "data-doc-pages",
  "data-doc-page-count-mismatch",
  "data-doc-abstained",
  "data-doc-audience",
  "data-doc-cited-seals",
] as const;

export type KnowledgeDocumentAbsence = (typeof KNOWLEDGE_DOCUMENT_ABSENCES)[number];

export interface KnowledgeDocumentFixture {
  name: string;
  payload: Record<string, unknown>;
  declares: KnowledgeDocumentAbsence[];
}

const PLACEHOLDER = "No content available.";

const RUNBOOK_BODY = [
  "# Rolling the frontend",
  "",
  "Pin by digest, never by tag.",
  "",
  "1. Read the digest from the registry.",
  "2. Render the chart with the pin and nothing else.",
].join("\n");

const ABSTAIN_SUBJECT = "http://invincible-agent/mesh#WarpDrive";
const ABSTAIN_SENTENCE =
  `No page in the corpus explains ${ABSTAIN_SUBJECT} yet. That is a gap in the documentation, not a failure of the question.`;

export const KNOWLEDGE_DOCUMENT_FIXTURES: KnowledgeDocumentFixture[] = [
  {
    // THE UNIVERSAL FALLBACK ROUTE: no `pages`, no `abstained` — the plain string, with a
    // subject that is an IRI rather than a written title (what the registry's own "UI
    // component not found" category and a slot elicitation both hand this card, per
    // `MarkdownRenderer.contract.ts`'s header).
    name: "plain markdown — the fallback route, subject is an IRI",
    payload: {
      subject_concept: "http://invincible-agent/mesh#StatefulSupportResponse",
      markdown_content: "A stateful support response, composed from the agent's own summary.",
    },
    declares: [],
  },
  {
    name: "plain markdown — subject is already a written title, not an IRI",
    payload: {
      subject_concept: "Rolling the frontend",
      markdown_content: RUNBOOK_BODY,
    },
    declares: [],
  },
  {
    name: "a docs answer — one page, count agrees, audience and cited seals both present",
    payload: {
      subject: "http://invincible-agent/mesh#FrontendRoll",
      pages: [
        {
          title: "Rolling the frontend",
          audience_hint: "PLATFORM_OPERATOR",
          cited_seals: ["tests/chart/test_render.py", "tests/chart/test_pin.py"],
          body: RUNBOOK_BODY,
        },
      ],
      page_count: 1,
      markdown_content: PLACEHOLDER,
    },
    declares: ["data-doc-pages", "data-doc-audience", "data-doc-cited-seals"],
  },
  {
    // THE MISMATCH BRANCH, isolated from audience/cited-seals so each attribute's fixture
    // proves only the one thing it names.
    name: "a docs answer — two pages, fewer than the engine counted",
    payload: {
      subject: "http://invincible-agent/mesh#FrontendRoll",
      pages: [
        { title: "Rolling the frontend", body: RUNBOOK_BODY },
        { title: "Why digests", body: "A tag can move; a digest cannot." },
      ],
      page_count: 3,
      markdown_content: PLACEHOLDER,
    },
    declares: ["data-doc-pages", "data-doc-page-count-mismatch"],
  },
  {
    name: "an abstain — the engine's sentence is drawn, naming the subject",
    payload: {
      subject: ABSTAIN_SUBJECT,
      abstained: true,
      reason: "no_page_explains_this_subject",
      body: ABSTAIN_SENTENCE,
      markdown_content: PLACEHOLDER,
    },
    declares: ["data-doc-abstained"],
  },
  {
    name: "an abstain whose sentence went missing — subject and reason still carry it",
    payload: {
      subject: ABSTAIN_SUBJECT,
      abstained: true,
      reason: "no_page_explains_this_subject",
      markdown_content: PLACEHOLDER,
    },
    declares: ["data-doc-abstained"],
  },
  {
    // THE DISCRIMINATOR'S STRICTNESS: a truthy STRING is not literally `true`, so this falls
    // through to the plain-markdown route rather than the abstain route.
    name: "abstained is a truthy string, not literally true — falls through to markdown",
    payload: {
      subject: ABSTAIN_SUBJECT,
      abstained: "false",
      markdown_content: "x",
    },
    declares: [],
  },
  {
    // THE NEAR SIDE of the empty-pages branch: a list that arrived but is empty is not an
    // answer, so the string is honoured rather than drawing a zero-page wrapper.
    name: "an empty pages list is not an answer — the string is honoured",
    payload: {
      subject_concept: "x",
      pages: [],
      markdown_content: "x",
    },
    declares: [],
  },
  {
    name: "a docs answer — page count agrees, no cited seals on this page",
    payload: {
      subject: "http://invincible-agent/mesh#FrontendRoll",
      pages: [{ title: "Rolling the frontend", body: RUNBOOK_BODY, cited_seals: [] }],
      page_count: 1,
      markdown_content: PLACEHOLDER,
    },
    declares: ["data-doc-pages"],
  },
];
