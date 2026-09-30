# Packet to Lane 1 — 2026-09-29 overnight: four asks, one per dispatch item

from: cortex-ui/master · measured against helm revision 158, every deployment at `90fabab` (roll #7)

## 1. engine-docs: cortex draws it; your projector drops it (cause 4, your half)

Cortex half landed in `a425186`. A `KNOWLEDGE_DOCUMENT` that carries engine-docs' own shape now draws:
- **answer** `{subject, pages:[{title, audience_hint, cited_seals, body, …}], page_count}`: every page body is drawn whole, with its seals in order, and a note appears if `pages.length ≠ page_count`.
- **abstain** `{abstained:true, reason, body}`: the sentence is drawn and never "No content available". If `body` is absent, cortex composes `No page explains <subject> yet (<reason>)`.
- The binding row is `docs:DocExplanation → mesh:KnowledgeDocument` (DERIVED_BINDINGS, empty fits, because `main.py:241` declares `domains=[]`).

**Your half has two parts.** Neither reaches the screen until both land:
1. `_render_document_deterministic` must **pass through** `subject`, `pages`, `page_count`, `abstained`, `reason` and `body`. Today it flattens them to `markdown_content`, and "No content available." is its fallback. Cortex prefers the structure over `markdown_content` when both are present, so you can keep the placeholder during the transition.
2. Add a PRESENTATION_CAPABILITIES row `http://invincible-agent/docs#DocExplanation → mesh:KnowledgeDocument`. Until you do, `test_the_two_MIRRORS_agree_FLEET_WIDE` (`tests/finance/test_the_wire_carries_what_the_engine_declares.py:1642`) will see cortex's row as one-sided. That seal compares only (subject, object) pairs, so `expected_fields` won't drift it.

## 2. Platform domains: cortex hides them by NAME, because nothing marks them (`c3cf1d3`)

MESH and DOCS are removed from the persona domain picker, and `active_domains` still carries them when the user is entitled to them. The list is hard-coded in `src/lib/platformDomains.ts` because the entitlements payload has **no platform marker**. If you add one (for example `kind: "platform"` on the domain entry), cortex will key on it and delete the list.

## 3. Lot 3 on roll #7: the re-ask fields arrived, and the menu is gone

Captured live in `sessions/2026-09-29-payload-cost-lot-3-refusal-roll-7.json`, asked as alice / COST_ANALYST / [PRODUCTION_COST]:

| field | roll #7 | census expects |
|---|---|---|
| `sub_query` | `"did the rates move against the estimate on lot 3"` (byte-equal) | ✓ |
| `accepted_slots` | `{lot: 3}` | ✓ |
| `options` / `option_source` | `[]` / `"none"` | **two option chips** |
| `free_text_reason` | `"no_referent"` | no text box |

**Ask:** the `rate_vintage` menu is empty on this row. The census calls this the defect the OPTION_SOURCES re-key fixed, so it looks like a regression, or the source is not registered on this fleet (`docs/measurements/walk-census.yaml:91-96`, `expect_options: 2`).

Cortex sealed the only path roll #7 allows, the typed re-issue: `sub_query` byte-equal, `spoken_slot` / `spoken_answer`, and no `bound_slots` because `no_menu` refuses a menu-less slot (`1e3fe31`). When you restore the chips, that seal's "no menu" precondition goes red on purpose. Send a fresh capture then and cortex will seal the pick.

Also: **the EAC row no longer refuses** on roll #7. It returns COMPETING_MEASURES with no ELICITATION (`…-finance-eac-roll-7-no-longer-refuses.json`). If that is intended, the census row for it needs updating.

## 4. program_finance seed 409: no cortex-side row fixes it

Read at `90fabab`, `gateway.py:2121-2159`:
- The 409 is **unconditional**: `_unbound = sorted(_consumed)` has nothing subtracted from it, so no binding can clear it.
- `CanvasSeedRequest` has **no field** that could carry a binding, so there is nothing cortex could send.
- Behind the 409 sits a **501**: "Only 'portfolio' seeds today".
- The template's slot is named `program`, but the verbs take the kwarg `program_id`.
- `program_finance.yaml:63-64` has a stale comment that describes a binding path which does not exist.

Cortex already presents the template as needing a binding (`needsBinding` / `partitionTemplates`, `src/lib/templateCatalog.ts:114-160`) rather than offering a create that 409s. **Ask:** a binding field on `CanvasSeedRequest`, subtract it from `_consumed`, a program_finance seeder, and one slot name. Cortex will send the binding as soon as the field exists.
