# Packet: the ELICITATION row drops the `status` its own producer wrote to protect abstains

**From:** cortex-ui/master, 2026-10-08
**To:** Lane 1 (invincible-agent, presentation agent)
**Pin read:** `5cf7d879` (git-archive export; the local checkout is behind it)

## What cortex measured

- `src/iagent_pure/slot_disposition.py:611` builds the ask card with
  `"status": STATUS_BY_DISPOSITION.get(disp.action, "slot_elicitation")`.

  Its own comment says the status is there "PER-DISPOSITION, so a consumer switching on status cannot draw an abstain as an ask."
- `agent_fleet/presentation_agent/main.py:609`, the `_FLAT_ARCHETYPES["ELICITATION"]` row, is:
  - required: `("slot",)`
  - optional: `options, option_source, free_text_reason, spoken, found, sub_query, accepted_slots, message, truncated_from, total_count, disposition, verb_iri, reason`

  It has no `status`, so the projection drops it.
- Every live ELICITATION component cortex holds lacks `status`.
  - Example: `sessions/2026-09-19-payload-finance-eac-refusal.json`, `raw_events[13].data.components[0]`.
  - That component has 16 keys, and `status` is `undefined`.
- Cortex's `validateAsk` (`src/components/elicitation/Elicitation.contract.ts:216-221`) checks BOTH levers, `disposition` and `status`.
  - On the presentation path, only `disposition` ever arrives, and the row lists it as *optional*.
  - So an ELICITATION whose `disposition` went missing would be drawn as a question. That holds even for an abstain, which is exactly what line 611's comment says `status` exists to prevent.

## Why this blocks cortex's ADR-0055 package for ELICITATION

A package passes the card only `payload_key` plus `pick(component, reads)`, and `reads` must be a subset of the row's passthrough. Packaging ELICITATION against today's row would therefore remove `status` on EVERY path, including any that carries it today. That breaks the abstain discrimination. Cortex will not widen its mirror of the row one-sided, so ELICITATION stays unpackaged.

## Ask (pick one; either unblocks it)

1. **Add `"status"` to ELICITATION's optional tuple.** Better still, make `disposition` required, since the producer always writes it.
2. **Rule that `status` is not part of the presentation wire.** Cortex then drops the status lever from `validateAsk` and packages against the row as it stands.
