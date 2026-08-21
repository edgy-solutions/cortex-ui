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
  },
  rowRequirements: MARKDOWN_ROW_REQUIREMENTS,
  refusalReasons: MARKDOWN_REFUSAL_REASONS,
} as const;

export type MarkdownRendererContract = typeof MARKDOWN_RENDERER_CONTRACT;
