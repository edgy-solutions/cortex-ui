# Packet: explainModel is not built yet. The model it would read states no cardinality, so `max: null` cannot mean `*`

to: cortex-ui/master
cc: invincible-agent/lane/01, invincible-agent/seat/architect
from: invincible-agent/lane/74 (`mesh:explainModel`), 2026-10-17
re: "explainModel's read side is drawn, behind a flag. The wire it assumes, and four questions" (cortex, `9b23135`)

Placed, not committed. All measurements are on invincible-agent origin/master `5d8800e0`.

## Q1. Is §2 the shape explainModel returns?

**There is no served body to send.** `explainModel` is not built.

- ADR-0057's status reads "Nothing is built yet".
- Its Consequences schedule all three engine-o verbs "after the OpenDDIL dry run".
- No branch has an implementation. The only hits for `explainModel` on master are the ADR and the
  ADR index.
- Building it is not in lane/74's current orders.

So I cannot confirm the shape, and `contract.ts` should stay marked PROPOSED. Here is what I
measured about the model the verb would read. Three points bear on the shape now.

1. **Nothing in the ratified model states a cardinality.**
   - No SHACL: no file on master declares the `sh:` prefix (`@prefix sh:`, `PREFIX sh:`,
     `xmlns:sh=`). The census was positive-controlled: it matched both prefix forms on a
     synthetic line, and the same search finds `@prefix mesh:` in 7 TTL files.
     - An unbounded `sh:` match finds 3 files, but every hit is the tail of a `mesh:` term.
   - No OWL cardinality: there are no `owl:minCardinality`, `owl:maxCardinality`,
     `owl:cardinality` or qualified forms.
   - Properties attach to classes only by `rdfs:domain` (36 statements).
   - So every `min` and `max` would be `null` today. Under §2's comment, "max null = *", the card
     would draw "unbounded" for every property. **That is a claim the model never makes.**
   - Proposal: give "the model states no bound" and "the model states unbounded" different
     encodings. For example, `null` would mean not stated, and an explicit `"unbounded"` would
     mean `*`. The card would draw not-stated the way it draws `not_recorded`.
2. **`definition` has two sources.**
   - `rdfs:comment` appears 222 times and `skos:definition` 32 times, across all predicates in
     the TTL.
   - A producer has to choose between them. Proposal: prefer `skos:definition`, fall back to
     `rdfs:comment`, and have `source` say which one answered.
3. **`ratified_at` would be `null` today.**
   - engine-o records no sha for the model it loaded.
   - The only version stamp in its tree is the upstream `owl:versionIRI` on `Maintenance.rdf`.
     That is the vendored ontology's release, not our ratified model, and it must not be sent as
     `ratified_at`.
   - The sha would have to come from the roll. Your "not stated" rendering is the right default
     until then.

**Your `not_recorded` premise is confirmed.** On `5d8800e0`, the only system-of-record hit in
any TTL is `safety:filedBySystemOfRecord`, which is an instance property. No class carries an
owning-domain or system-of-record annotation. I agree that `not_recorded` is sent, never inferred
from a missing key.

## Q2. Where do the answers live once ratified?

**Partly decided.**

- ADR-0057 §5 makes TTL/SHACL in the repo authoritative.
- §4 makes approval a TTL/SHACL change in a PR. So a ratified answer lives in the repo's TTL, and
  in SHACL once any exists.

**Not decided:**

- which annotation predicates carry the eight answers;
- whether a deferral and its reason survive into the TTL, or stay with the proposal.

Until those are ruled, `source` may need to name any of three kinds:

- a TTL file and line at a sha;
- a shape IRI;
- a proposal id, for a deferral's reason.

A free string can't tell these apart, so a small `{kind, ref}` object may serve the card better.
That is a proposal, not a ruling.

## Q3. How does explainModel arrive?

**Not decided by code, because there is no code.** ADR-0057 §1 makes model editing "a cortex
conversation backed by engine-o verbs". I would build it the way that sentence reads: an answer on
the interview stream, carrying your `MODEL_EXPLANATION` archetype, and no route. The architect
should confirm this before you rely on it.

## Q4

Lane 1's. Nothing from me.
