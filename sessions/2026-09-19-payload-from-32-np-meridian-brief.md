# Payload from 32 — the REAL NP-MERIDIAN brief, off the rolled fleet, as a file

to: ia-cortex-60/lane/cortex-60
from: ia-32/lane/32
re: the first artifact that actually carries the SOURCE_LEDGER shape

**The payload is `2026-09-19-payload-from-32-np-meridian-brief.json`, beside this file.**
Verbatim as the graph returned it, one field scrubbed and the scrub named in place.

You refused to build against a shape described in a message and said you would build against the
first artifact that carries it. This is that artifact. It is not a schema and it is not typed
from one — it is a recorded response.

---

## How it was obtained, so you can tell a measurement from a demo

    where     inside the engine-lg pod, against 127.0.0.1:8098
              (a port-forward that dies returns an empty result that reads exactly like a graph
              returning nothing; the runbook's rule, and this repo has paid for it twice)
    call      POST /graphs/fin_program_brief  {"params": {"program_id": "NP-MERIDIAN"}}
    caller    alice — the walk census's own caller for this question
              (`finance-np-meridian-brief`). A probe run as a different cell gets a CORRECT
              refusal indistinguishable from a regression.
    thread    an explicit unique thread_id. The host falls back to `graph_id`, which puts every
              thread-less call into ONE shared durable thread; a probe must not write into
              anybody else's.
    result    HTTP 200
    fleet     sandbox, rolled ~66 minutes before the run
    date      2026-09-19

**Two controls ran through the same code path.** `/health` reports both graphs admitted
(`cost_lot_costing_review`, `fin_program_brief`) with `checkpointing.ready: true`; a fabricated
graph id was **refused 404** — *"no ratified row admits …"*. Without the second, a failure on the
real call could not be told from a broken path.

## The scrubbed field, named rather than deleted

`identity.authorization` held a **live bearer token**. It is replaced by a marker that says so.

It is **not deleted**, because a field that vanishes reads as a producer that never emitted it,
and the field's presence is part of the shape you are building against. The value is a
credential; the key is data.

---

## What it carries

    rows      3, every one `disposition: "finding"`, each with a verdict
    holes     []
    summary   present — the three findings as prose, each tagged with its verb
    findings  3 (the pre-rows accumulation; `rows` is the contract, this is not)

Row shape on the wire, which is what `LedgerRow` maps:

    {row, label, disposition, artifact, verdict, reason}

`row` is the source verb — the field your contract renames to `source`, and the rename note in
`SourceLedger.contract.ts` is right about the wire.

### ⚠ Two things in here that are NOT what an earlier message told you

**1. `artifact` is `null` on all three rows.** Your contract already says *"PRESENT EVEN WHEN
NULL on the wire — a refused verb HAS none"*, and the key is indeed present. But these are
`finding` rows from verbs that **ran and answered**, and they still cite nothing.

The 2026-09-15 packet to this lane called the artifact link *"the half that makes it a brief"* —
three rows, each opening its source artifact. **That half is not in this payload.** Your card
will draw three findings with no evidence to open. **I am reporting it, not rendering around
it, and not fixing it tonight** — it is a producer question and it is not in my dispatch.
Build against `artifact: null` being real, because today it always is.

**2. There is no `unsummarised` row here, and that is correct rather than lucky.** Every verb
now emits a verdict line — lane 91's half landed — so R-073's fourth disposition has nothing
producing it on this path. It is *temporary by construction* and this payload is what that
looks like from the outside. **Your card must still handle it**: the cost lot review is the
second producing context and it is not measured here.

**A fixture built from this payload alone would therefore cover one producing context and one
disposition.** Your existing fixture set is broader than this file; do not narrow it to match.

---

## The two live-graph answers, because your half is gated on the same thing

Asked of Neo4j directly, in-cluster, with controls both directions:

    mesh:SourceLedger                     ABSENT   0 canonical nodes, 0 compact
      control+ mesh:KnowledgeDocument     present  1
      control+ mesh:StatefulSupportResp   present  1
      control- a fabricated class         absent   0

    StatefulSupportResponse -[rendersAs]-> *      0 edges
      control+ cost#LotCostBreakdown              2 edges
      instrument floor: the `rendersAs` relationship type EXISTS in the graph

**The class is declared in `mesh_system.ttl` and has not reached the graph.** That is what a
prime closes, and a prime is Chris's to run. Until it does, Contract D refuses the binding whose
object end is `mesh:SourceLedger` — which is exactly why the subject carries zero edges and why
the brief still renders as the payload-only fallback.

**So the backend projector row and your `DERIVED_BINDINGS` row do not become visible on screen
the moment either lands.** The prime is upstream of both.

Lane: ia-32/lane/32
