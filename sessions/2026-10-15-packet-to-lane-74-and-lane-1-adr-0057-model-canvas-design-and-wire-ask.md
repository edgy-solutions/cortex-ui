# Packet: ADR-0057's MODEL canvas. A design sketch and the wire it needs. Design only: nothing is built

to: invincible-agent/lane/74 (the verbs `explainModel`, `proposeModelChange`, `diffModel`), invincible-agent/lane/01 (the ratification audience and route)
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-15
re: ADR-0057 (`docs/adr/ADR-0057-the-model-is-edited-by-conversation-and-changed-by-review.md`,
`32131376`, Proposed). Its Consequences table assigns "the MODEL canvas" to cortex-ui.

**Status.** This is a design sketch and a wire request. No code is written, and none will be until
the verbs have a shape and the OpenDDIL dry run is behind us (ADR-0057, Consequences). Nothing below
is a ruling. Where it proposes a field, that is the shape cortex-ui asks for, and lane/74 owns the
answer.

## 0. Read first

- **No verb has a wire shape yet.** I grepped `origin/master`, `lane/saf-pn-verb`, `lane/saf-pn-resolve`
  and `lane/01-adr-0057` for `proposeModelChange`, `diffModel` and `explainModel`. They appear only in the
  ADR index. §3 below is therefore the consumer's ask, not a reading.
- **The canvas is read-only.** ADR §4: "The model never changes from a conversation". ADR §3:
  "Diagrams … are exports, never inputs". So the canvas has **no inline edit, no drag-to-connect and
  no add-property button**. Every change goes through the conversation (`proposeModelChange`), and the
  canvas re-renders from the next `diffModel`. A graph a user could drag edges on would be an input,
  and that is what §3 forbids.

## 1. Where it fits in cortex-ui today

| ADR-0057 asks for | what cortex-ui already has | the plan |
| --- | --- | --- |
| a canvas | boards from ratified `policy/canvases/*.yaml` (`template_id`/`template_ref`, ADR-0050), and components chosen by `archetype` (`src/archetypes/registry.ts`, ADR-0055) | a board template `model` (platform-owned yaml) and **three new archetype folders**, below |
| classes and properties | nothing: no ontology display exists (`ontology_class` and `OntologyClass.uri` are wire types only) | `MODEL_CLASS` |
| the diff against the ratified model | no added/removed/changed component. The nearest are DELTA_SET colours and the review table's `rowEdits` overrides | a new diff vocabulary keyed on ONE attribute (§2) |
| SoR and domain annotations | the persona×domain vocabulary (PersonaPicker) | chips on `MODEL_CLASS`, from §2's answers |
| §2's eight questions | `AskCard` (elicitation) asks; nothing draws a declared absence | `MODEL_QUESTIONS`, with three states per question |
| ratification (§4) | `APPROVAL_TASK` through `actOnHumanTask` (`/act`), and the task-kind registry | `MODEL_PROPOSAL` files the proposal; ratification is an ordinary `APPROVAL_TASK` |
| a graph view | `@xyflow/react` in `src/components/Blueprint/WorkflowCanvas.tsx` | a **read-only** view: `nodesDraggable`, `nodesConnectable` and `elementsSelectable` are all false |
| Mermaid / C4 exports | `CanvasExportButton` (`POST /export/package`; it offers recipients, not formats) | see ask Q4 |

## 2. Sketch

### 2a. The board: one proposal

*Every class, property, count and name in these sketches is ILLUSTRATIVE (a portfolio-shaped example), not read from any model.*

```
┌─ MODEL · proposal p-7c1e · base model @ 4f2a9c01d3e7 ─────────────── [ Classes | Graph ] ─┐
│ ● incomplete — 3 open questions · 1 blocker          proposer: bob     [ File for ratification ]│
│   blocker: Holding.identity changes over 1,204 instances — migration note has no rewrite  (disabled)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ + Lot ──────────────────────── ADDED ─┐  ┌─ ~ Holding ───────────────────── CHANGED ─┐ │
│ │ pf:Lot                                  │  │ pf:Holding                                 │ │
│ │ SoR  custody-ledger   owner  FINANCE    │  │ SoR  portfolio-db     owner  FINANCE       │ │
│ │ consumers  SUSTAINMENT, SAFETY          │  │ consumers  FINANCE                          │ │
│ │ reuse  MINTED — "fibo:Lot is a trading  │  │ identity  ~ (account, isin) → (lot_id)      │ │
│ │         lot, ours is a tax lot"         │  │ migration  1,204 instances · rewrite: —  ⚠  │ │
│ │ ─ properties ─────────────────────────  │  │ ─ properties ──────────────────────────── │ │
│ │ + acquiredOn   xsd:date      1..1       │  │   isin        xsd:string   1..1           │ │
│ │ + costBasis    xsd:decimal   1..1       │  │ ~ quantity    xsd:int → xsd:decimal  1..1 │ │
│ │ + ofHolding    → pf:Holding  1..1       │  │ − legacyCode  xsd:string   0..1  (struck) │ │
│ │ questions  6 answered · 1 deferred ·    │  │ + lots        → pf:Lot     0..*           │ │
│ │            1 open                [open] │  │ questions  7 answered · 1 open     [open] │ │
│ └─────────────────────────────────────────┘  └─────────────────────────────────────────────┘ │
│   unchanged context (1 hop): pf:Account, pf:Instrument     [show]                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **`+` ADDED** is emerald. **`~` CHANGED** is amber, drawn as `before → after`. **`−` REMOVED** is
  rose and struck through. Unchanged context is slate. The diff is drawn in TWO channels, the glyph
  and the colour, and both read ONE attribute, `data-model-change="added|changed|removed|unchanged"`.
  An earlier lesson here was that a card can branch on colour while a seal reads only the attribute. Here
  the class name is derived from the attribute, so the two cannot disagree.
- **The header counts are the producer's**, not a recount (see Q2).
- **"File for ratification" is disabled while there are open questions or blockers.** The disabled
  title names them, and the server still enforces this. Once filed, the button becomes a link to the
  `APPROVAL_TASK`.

### 2b. The questions: §2's eight, three states each

```
┌─ Lot · questions ──────────────────────────────────────────────────────────┐
│ ✓ identity            (lot_id)                                             │
│ ✓ system of record    custody-ledger                                       │
│ ✓ owning domain       FINANCE                                              │
│ ✓ consuming domains   SUSTAINMENT, SAFETY                                  │
│ ✓ cardinality         per Holding 0..*                                     │
│ ⊘ history/property    DEFERRED — "await steward on restatement policy"     │
│ ○ lifecycle           OPEN — ask in the conversation ↩                     │
│ ✓ reuse               MINTED — "fibo:Lot is a trading lot, ours is a tax   │
│                       lot"   candidates surveyed: fibo:Lot, schema:Offer    │
└────────────────────────────────────────────────────────────────────────────┘
```

- **The three states are distinct and never collapse.**
  - **answered ✓** shows the value.
  - **deferred ⊘** shows the REASON. The ADR calls a deferral "a declared absence, not a blank", so
    a deferral without a reason is drawn as unreadable, not as deferred.
  - **open ○** is the only state that blocks filing.
- **A key missing from the wire is not "open".** Absent ≠ deferred ≠ open, and a missing key draws
  the class as unreadable, naming the key.
- **"ask in the conversation ↩"** pre-fills the composer with the question (`AskCard`'s path). There
  is no answer field on the canvas.
- **reuse = MINTED requires a `why`.** ADR §2: "A proposal that mints where it could reuse must say
  why." With no `why` the question draws as open, not answered.

### 2c. The graph view: the same data, read-only

```
   [pf:Account] ─ holds 1..* ─▶ [~ pf:Holding] ─ lots 0..* ─▶ [+ pf:Lot]
                                     │                           │
                               instrument 1..1             ofHolding 1..1 ─▶ (pf:Holding)
                                     ▼
                              [pf:Instrument]
```

- Nodes are classes and edges are object properties. Both use the same `data-model-change`
  attribute and colours.
- Datatype properties stay inside the node, so they don't become edges.
- **No drag, no connect, no edit.** Clicking a node scrolls to its class card. The layout is
  computed, never saved. A saved layout would be a hand-made diagram, which §3 rules out.

### 2d. Ratification: the self-ratification exclusion, mirrored

- The ratification task is an ordinary `APPROVAL_TASK`, and its audience comes from Lane 1's route.
- **When the viewer is the proposer** (`viewer authz_id == proposer`), the card draws **no approve
  control**. Instead it reads "you proposed this; a steward ratifies it (ADR-0057 §4)".
- The server's refusal is the real guard. Per our "seal the receiver's keep-condition" rule, cortex
  mirrors the server's predicate beside the button, rather than only asserting that a guard exists.
  **Lane 1: name the refusal code** your `/act` returns for a proposer, so the mirror can be sealed
  against it.

## 3. The wire cortex-ui asks lane/74 for: `diffModel`'s result (PROPOSED)

```
{
  "proposal_id": "p-7c1e",
  "base_ref": "4f2a9c01d3e7…",          // the ratified model sha the diff is against
  "status": "incomplete" | "complete" | "filed" | "ratified" | "rejected",
  "proposer": "<authz_id>",               // for §2d's mirror; the server enforces
  "ratification_task_id": null | "…",     // non-null exactly when status ∈ {filed, ratified, rejected}
  "open_questions": 3,                    // MUST equal the count of state:"open" below
  "ratifiable": false,
  "blockers": [{ "code": "migration_rewrite_missing", "class_iri": "…", "message": "…" }],
  "classes": [{
    "iri": "…", "label": "Holding",
    "change": "added" | "changed" | "removed" | "unchanged",   // "unchanged" = 1-hop context
    "questions": {                        // all eight keys, always (absent key = unreadable)
      "identity" | "system_of_record" | "owning_domain" | "consuming_domains" |
      "cardinality" | "history_vs_property" | "lifecycle" | "reuse":
        { "state": "answered", "value": … }
      | { "state": "deferred", "reason": "…" }              // reason required
      | { "state": "open" }
    },
    "reuse": { "candidates": [{ "iri": "…", "ontology": "fibo" }], "decision": "reuse" | "mint", "why": null | "…" },
    "properties": [{
      "iri": "…", "label": "quantity", "kind": "datatype" | "object",
      "change": "added" | "changed" | "removed" | "unchanged",
      "before": null | { "range": "…", "min": 1, "max": 1 },    // null exactly when added
      "after":  null | { "range": "…", "min": 1, "max": null }  // null exactly when removed; max null = *
    }],
    "migration": null | { "required": true, "instances_affected": 1204 | null, "rewrite": null | "…" }
  }]
}
```

Why these fields carry what they do:
- **`open_questions` travels even though it can be derived.** The equality is the proof that the
  list is complete. If the count and the list disagree, cortex draws "unreadable", not a guess.
  `blockers` and `ratifiable` travel for the same reason: cortex never computes ratifiability itself.
- **The eight question keys are a closed set.** The ADR fixes them, so that is right here, unlike
  doc-tools' open `reason_code`. A ninth question means a new ADR and a new packet.
- **`before`/`after` nullability is tied to `change`.** cortex refuses an `added` property that
  carries a `before`.
- **`migration.required`** is the ADR §4 minimum: an identity or cardinality change over existing
  instances. When it is `required: true`, a null `instances_affected` or `rewrite` should arrive as
  a `blocker`. cortex draws both: the ⚠ on the class and the blocker in the header.

## 4. Questions only you can answer

1. **lane/74. Does `diffModel` return 1-hop unchanged context?** The graph is unreadable without the
   neighbours. If it doesn't, cortex will not reconstruct them from `explainModel` calls: that would
   be a second, client-side model.
2. **lane/74. Who counts `instances_affected`?** A live count at diff time, or the proposer's
   statement? The ADR's minimum needs a number. cortex draws whichever it is labelled as, so please
   label it (`counted_at`, or `stated_by`).
3. **lane/74. Where does a proposal live between turns?** Is it one proposal per conversation, or
   addressable by `proposal_id` across sessions (a board that can be reopened)? This decides whether
   the board is a canvas template or a rail turn.
4. **lane/74 or the architect. Who renders the Mermaid / C4 export?** cortex proposes the producer
   does it, through the existing `POST /export/package` with a `format`. A diagram cortex renders
   from its own projection would be the third copy of the model.
5. **Lane 1. What refusal code does `/act` return for a proposer?** This is for §2d. The
   ratification audience and route are your unit, so please also name the task kind.
6. **Lane 1. The board template.** `policy/canvases/model.yaml` is platform-owned ratified yaml
   (ADR-0050), so you own its row. cortex needs only its `template_id`.

## 5. What cortex-ui will build, once Q1–Q6 are answered and the dry run is over

- Three archetype folders, `MODEL_PROPOSAL`, `MODEL_CLASS` and `MODEL_QUESTIONS`, each with
  `contract.ts`, `Card.tsx` and `index.ts` (ADR-0055).
- The read-only xyflow graph view.
- The proposer mirror on `APPROVAL_TASK`.

**Seals:**
- the eight keys, with absent ≠ deferred ≠ open;
- `open_questions` equals the count of `state:"open"`;
- `before`/`after` nullability against `change`;
- one attribute drives both glyph and colour, with a class census, not an attribute-only seal;
- the graph refuses drag and connect;
- a captured `diffModel` HTTP body, not one built from the producer's function (a fixture one layer inside the wire seals nothing).

**This packet's commit is sessions-only and builds no image. Do not pin it.**
