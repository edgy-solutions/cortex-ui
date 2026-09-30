/**
 * MarkdownRenderer's own contract (KNOWLEDGE_DOCUMENT).
 *
 * Sits beside `SemanticInterpreter.tsx`, which houses the component, per the ADR-0017
 * amendment: the contract's home is the component layer, and the registration payload is
 * ASSEMBLED from it rather than authored beside it.
 *
 * THE MOST IMPORTANT FACT HERE IS AN ABSENCE: this archetype has an EMPTY REFUSAL
 * VOCABULARY. MarkdownRenderer accepts any string — there is no payload shape it declines
 * to draw. That is not an oversight to be filled in later; it is *why*
 * KNOWLEDGE_DOCUMENT is the universal fallback in `capability_registry.UNIVERSAL_ARCHETYPES`
 * and why slice 4 can route an unsatisfiable payload here and know it will render.
 *
 * Stating the emptiness explicitly matters: a reader who found no `refusalReasons` could
 * reasonably assume the contract was half-written and "helpfully" add some, which would
 * make the universal fallback refusable and leave slice 4 with nowhere to land.
 *
 * IMAGES RESOLVE THROUGH THE BFF. `img` is mapped to `FederatedImage`, which forwards an
 * `s3://` src to cortex-bff `/federated_image` under the caller's JWT. So markdown may
 * legitimately carry `s3://` image URLs; they are not broken links.
 */

/** Chart-style row requirements do not apply — declared so the shape is uniform. */
export const MARKDOWN_ROW_REQUIREMENTS = {} as const;

/**
 * DELIBERATELY EMPTY. See the module docstring: an empty refusal vocabulary is the property
 * that makes this archetype safe as the universal fallback. Do not populate it without
 * changing `UNIVERSAL_ARCHETYPES` too.
 */
export const MARKDOWN_REFUSAL_REASONS = [] as const;

export const MARKDOWN_RENDERER_CONTRACT = {
  archetype: "KNOWLEDGE_DOCUMENT",
  component: "MarkdownRenderer",
  layout: "full-width",
  fields: {
    /** GitHub-flavoured markdown. Any string renders, including the empty one. */
    markdown_content: { encoding: "string", required: true },
    /** Card title. Falls back to "Knowledge Document" when absent. */
    subject_concept: { encoding: "string", required: false },
    // ── engine-docs (`mesh:explain`) — OPTIONAL, and WINNING when present ──────────────────
    //
    // invincible-agent `agent_fleet/docs_agent/explain.py` (`explain`, `abstain`) and
    // `main.py:360-370` (the envelope). Neither shape carries `markdown_content`; the platform's
    // deterministic projector wrote "No content available." over them. When `pages` or
    // `abstained` arrives, the card draws THAT and ignores `markdown_content` — see
    // `knowledgeDocumentView.ts`. None of these can make the card refuse: the vocabulary below
    // stays empty, which is what keeps this archetype the universal fallback.
    /** The subject asked about. Names the gap on an abstain. */
    subject: { encoding: "string", required: false },
    /** Every tied page, each `{title, audience_hint, cited_seals, body, ...}`; each drawn whole. */
    pages: { encoding: "array", required: false },
    /** How many pages tied. Kept so a card with fewer pages than counted says so. */
    page_count: { encoding: "number", required: false },
    /** `true` on an abstain: no page explains the subject yet. A result, not a failure. */
    abstained: { encoding: "boolean", required: false },
    /** The abstain's machine reason, e.g. `no_page_explains_this_subject`. */
    reason: { encoding: "string", required: false },
    /** The abstain's sentence, naming the subject. Drawn as written. */
    body: { encoding: "string", required: false },
  },
  rowRequirements: MARKDOWN_ROW_REQUIREMENTS,
  refusalReasons: MARKDOWN_REFUSAL_REASONS,
} as const;

export type MarkdownRendererContract = typeof MARKDOWN_RENDERER_CONTRACT;
