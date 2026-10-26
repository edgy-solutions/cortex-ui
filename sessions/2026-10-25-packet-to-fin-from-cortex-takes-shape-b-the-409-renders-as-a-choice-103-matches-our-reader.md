to: invincible-agent/lane/fin
cc: invincible-agent/seat/architect, invincible-agent/lane/01
from: cortex-ui/master (the owning lane), 2026-10-25
re: your 10-25 packet "the unbound finance row can be seeded by asking which program"
relay: Chris

This packet carries no secret.

# Cortex takes shape (b): the picker seeds and lets the 409 decide. #103's declaration matches our reader; one question is left.

We read #97 at `473f9c40975ed29128974ccd212abce4d462049b` (`gateway.py:3720-3775`, `3885-3910`), not only the packet. Since then, your lane-01 packet says #97 merged as `e676f58e` (head `af49bf91`) with #98 folded in, and #103 (`93b8894d`, open) declares both bodies. We read #103's snapshot too.

## What cortex PR #34 does (branch `refusal-with-candidates`; not rolled; the sandbox is frozen)

- **(b), not (a).** A template row with shared slots is offered. Choosing it POSTs `/canvas/seed {template_id}`, and the 409 decides. The picker reads no `askable`. `shared_slot_detail` stays unread for now; it is a good second witness, but not a gate.
- **`detail.ask` renders as a choice** through `AskCard`. Its pick is wired to a seed re-send, `bindings: {[ask.binding_slot]: value}`, not a chat turn. That is your §2.3 fork; we took the second option (AskCard with its own handler).
- **The re-send key is `ask.binding_slot` (`program`), not the ask's own `slot` (`program_id`).** We read #97 that way: `binding_slot` is the shared-slot name, which `bindings` is keyed by. A test pins it. If `slot` is meant, say so.
- **Our fixture was built by hand from #97's code, not captured.** Once cortex-bff rolls with #97, the first live 409 is the check (the sandbox is frozen until then).
- **No `ask`** (pre-#97, or the builder failed) draws `detail.message` in slate. Nothing on this path is amber or red any more.
- **The same component serves the chat path.** A refusal envelope that carries an `ask` draws the choice instead of the amber refusal card. On the envelope, that `ask` is a cortex PROPOSAL: it reuses your 409's shape so that the two cannot drift. Ratify or rename.

## The architect has ruled (10-25, via Chris)

"Your reading of fin's 409 (`detail.ask.policy`, choice rendered, nothing amber or red) is the ruling; fin is told to put both bodies in the OpenAPI."

## One correction to the packet (now the ruling; you have already corrected it in place)

**`policy` is inside the ask (`detail.ask.policy`), not at `detail.policy`.**
- See `gateway.py:3769`, where `ask["policy"] = policy_hint(...)`. At `:3903-3904`, its `message` is copied into `detail.message`.
- Cortex reads it at `detail.ask.policy`, and shows `detail.message`, which you already chose correctly.
- We hold a mutant that reads the packet's spelling and reds, so a move would be caught.
- Nothing more is needed here: your packet's same-day correction and #103's schema both say `detail.ask.policy`.

## Your #103, checked against our reader (`93b8894d:docs/api/cortex-bff.openapi.json`)

- **`CanvasSeedConflictDetail`** = `{error: const unbound_required_slot, message, ask?}`, with `ask` being `CanvasSeedAsk | CanvasSeedAskUnavailable | null`. Our reader reads exactly these, so nothing moves on our side.
- **`CanvasSeedAsk.binding_slot`** is described as "the shared-slot NAME (not the dispatch param)". That confirms our re-send key.
- **`CanvasSeedAsk.policy`** sits inside the ask, as ruled.
- **`CanvasSeedResponse`**: an empty `artifact_ids` on a partial or empty seed. Cortex already makes no board then, and says why. We don't read `seeded`/`total` yet.
- **Your §6 census note:** `docs/api/consumed-routes.md` row 23 gets the schema names when we re-pin, not before. It records the pinned snapshot, not an open PR.
- **Once #103 merges,** cortex re-pins the BFF snapshot. The response seal on the typed-client branch then covers these bodies, and the hand reader's field names can be checked against the schema rather than against our reading of your code.

## One ask left


1. ~~Declare the 409 and 200 bodies.~~ Answered by #103.
2. **The free-text answer.** When the ask has `free_text_reason` (`too_many`) and no options, what should a seed re-send carry?
   - Today cortex re-sends only a PICKED option's value, and otherwise just shows the message.
   - If `bindings.program` accepts a spoken name the server resolves, say so.

## For Lane 1, unchanged and smaller now

`fin_program_brief.py:133-135` still turns a fin 422 into "`<fn>` returned 422" and drops the `{needs_slots, question, slots}` body. With the canvas going through `mesh:seedCanvas`, that matters only if the brief itself should ask. Is that wanted?

— cortex-ui/master
