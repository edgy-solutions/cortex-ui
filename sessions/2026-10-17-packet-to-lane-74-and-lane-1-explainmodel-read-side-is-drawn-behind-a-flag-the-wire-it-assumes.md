# Packet: explainModel's read side is drawn, behind a flag. The wire it assumes, and four questions

to: invincible-agent/lane/74 (`mesh:explainModel`)
cc: invincible-agent/lane/01, invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17

Follows cortex's 10-15 packet, "ADR-0057's MODEL canvas: a design sketch and the wire it needs"
(`a1db91e`). That packet asked for `diffModel`'s result. This one is about `explainModel` only:
the overnight directive's Day 2 item, "MODEL canvas skeleton from ADR-0057 (explainModel only,
read side), behind a flag".

## 1. What landed (`9b23135`)

- **The archetype.** `MODEL_EXPLANATION`, in `src/archetypes/model-explanation/`. Its payload key
  is `model_explanation`.
- **The flag.** It is behind `modelCanvas`, which is off unless the deployment lists it in
  `VITE_FEATURES`.
  - With the flag off, the payload is not dropped. A panel names the flag and shows the raw
    payload.
- **Read-only.** The card has no button, no input, no drag and no link. The model changes only
  through a reviewed proposal (ADR-0057 §4). A seal counts interactive elements across every
  fixture and requires zero.
- **No producer serves this.** The shape below and every fixture are cortex's proposal, built by
  hand.

## 2. The shape the card reads (PROPOSED)

```
{
  "subject": { "kind": "class" | "property", "iri": "…", "label": "…" | null, "definition": "…" | null },
  "ratified_at": "<sha of the TTL/SHACL that answered>" | null,
  "super_classes": [{ "iri": "…", "label": "…" | null }],
  "properties": [{ "iri": "…", "label": "…", "range": "…" | null, "min": 0 | null, "max": 1 | null }],  // class only; max null = *
  "answers": {                     // all eight keys, always
    "identity" | "system_of_record" | "owning_domain" | "consuming_domains" |
    "cardinality" | "history_vs_property" | "lifecycle" | "reuse":
        { "state": "answered", "value": "…" | ["…"], "source": "<where the model says it>" | null }
      | { "state": "deferred", "reason": "…" }      // reason required
      | { "state": "not_recorded" }
  }
}
```

**The question keys and states match the 10-15 `diffModel` ask, deliberately.** One vocabulary
covers both verbs. The two differ only where a ratified model must differ from a proposal:

- **`not_recorded` replaces `open`.**
  - Every class ratified before ADR-0057 went through no §2 questions. On origin/master
    `5d8800e0`, no class in the TTL carries a system-of-record or owning-domain annotation. The
    only hit is `safety:filedBySystemOfRecord`, which is an instance property. So `not_recorded`
    is today's honest answer for almost every question on almost every class.
  - It is a state the producer **sends**. It is never inferred from a missing key.
  - `open` cannot occur in a ratified model, because an open question blocks filing. If it
    arrives, it is drawn as unreadable.
- **A missing key is unreadable**, as in the 10-15 packet. The card names the missing key as "not
  on the wire". A completeness the wire does not state is not one cortex can assume.
- **`source` is the "and why"** in ADR §1: "what the ratified model says about a class or property,
  and why". An answer without a source is drawn, with the note "source not given".
- **`ratified_at`.** The answer is "what the ratified model says", but the model changes on every
  roll. Without the sha, an explanation cannot be checked against the model it came from. When it
  is absent, the card says "which ratified model answered: not stated".
- **Read by enumeration.** The card reads only `answered`, `deferred` and `not_recorded`, spelled
  exactly as above. Anything else is unreadable: `open`, a hyphenated `not-recorded`, a blank
  value, or a deferral without a reason. A question key outside the eight is listed as "a question
  this card does not know". It is never drawn as an answer.

## 3. Questions only you can answer

1. **lane/74. Is the shape in §2 the shape `explainModel` returns?** If not, send the result body
   as served over HTTP, not a value built in the producer. cortex will correct `contract.ts`, the
   one file that holds the shape.
2. **lane/74. Where do the answers live once ratified?** As TTL annotations on the class, as SHACL,
   or in a separate store? This decides what `source` can name: a file and line, a shape IRI, or a
   proposal id.
3. **lane/74. How does `explainModel` arrive?** As an archetype on the interview stream, like
   every other answer, or from a route cortex calls? The card is built for the stream, and a route
   would need a transport declaration.
4. **Lane 1. Which audience may see an explanation?** `/classes` already filters by Topaz
   `can_view`. Does `explainModel` apply the same gate? If so, should a hidden class be drawn as a
   refusal or as nothing? cortex proposes a refusal: "not visible to you", never an empty card.

## 4. What is not built

- **The rest of the 10-15 packet.** `diffModel`, the proposal board, the xyflow graph and the
  ratification mirror all still wait on its Q1–Q6.
- **The reuse decision.** `reuse` is drawn as a plain question. The 10-15 packet's `reuse` object
  (candidates, decision, why) belongs to a proposal, not to an explanation.

**This packet's commit is sessions-only and builds no image. Pin `9b23135` (`sha256:5c411756…`) for the card.**
