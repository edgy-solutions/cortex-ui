/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `KNOWLEDGE_DOCUMENT_ENVELOPE_FIELDS`, which here equals `row.passthrough` in
 * full — see `contract.ts`'s note on why nothing is declared-but-unread for this archetype.
 * `source_persona` is in neither: the universal cross-cutting field, read once by
 * `SemanticInterpreter.tsx` for the persona badge, same as before this move.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { MarkdownRenderer } from "./Card";
import { MARKDOWN_RENDERER_CONTRACT, KNOWLEDGE_DOCUMENT_ENVELOPE_FIELDS } from "./contract";
import { KNOWLEDGE_DOCUMENT_ABSENCES, KNOWLEDGE_DOCUMENT_FIXTURES } from "./fixtures";
import { KNOWLEDGE_DOCUMENT_ROW } from "./row";

export default defineArchetype({
  id: "KNOWLEDGE_DOCUMENT",
  contract: MARKDOWN_RENDERER_CONTRACT,
  Card: MarkdownRenderer,
  row: KNOWLEDGE_DOCUMENT_ROW,
  reads: KNOWLEDGE_DOCUMENT_ENVELOPE_FIELDS,
  absences: KNOWLEDGE_DOCUMENT_ABSENCES,
  fixtures: KNOWLEDGE_DOCUMENT_FIXTURES,
});
