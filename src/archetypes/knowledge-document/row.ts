/**
 * ADR-0055's DECLARED ROW — cortex's copy of the producer's tuple.
 *
 * Mirrored against `agent_fleet/presentation_agent/main.py`, read fresh for this package:
 *
 *     _DOCS_PASSTHROUGH_KEYS = ("subject", "pages", "page_count", "abstained", "reason", "body")
 *     # :289
 *
 *     component = {
 *         "archetype": "KNOWLEDGE_DOCUMENT",
 *         "source_persona": persona,
 *         "subject_concept": subject_concept,
 *         "markdown_content": markdown_content,
 *     }
 *     # :368-372, then component.update(_docs_explanation_passthrough(agent_response))
 *
 * `markdown_content` is `payload_key` (the one field every KNOWLEDGE_DOCUMENT carries, even
 * when it is a placeholder the structured fields below override — see
 * `knowledgeDocumentView.ts`'s module docstring). `source_persona` is left out of
 * `passthrough`: it rides every archetype's component, read once in
 * `SemanticInterpreter.tsx` for the persona badge, and is not part of THIS verb's own tuple.
 *
 * `passthrough` is deliberately wider than `reads` would be on most packages, except here it
 * is not — see `contract.ts`'s `KNOWLEDGE_DOCUMENT_ENVELOPE_FIELDS` note. `defineArchetype`
 * enforces the inclusion the other way (a card may not read what the row does not declare),
 * never the reverse.
 */
export const KNOWLEDGE_DOCUMENT_ROW = {
  archetype: "KNOWLEDGE_DOCUMENT",
  payload_key: "markdown_content",
  passthrough: [
    "subject_concept",
    "subject",
    "pages",
    "page_count",
    "abstained",
    "reason",
    "body",
  ],
} as const;
