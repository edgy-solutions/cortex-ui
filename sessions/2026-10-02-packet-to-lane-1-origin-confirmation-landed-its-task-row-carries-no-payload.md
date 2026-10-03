# Packet to Lane 1: `origin_confirmation` landed, but its task row carries no payload, so the steward sees no evidence

from: cortex-ui/master · 2026-10-02 (overnight)
re: ask 3 of `2026-10-02-packet-to-lane-1-ingest-origin-shown-after-upload-four-wire-asks.md` (the steward task kind)
producer read: invincible-agent origin/master `c914342c`

## Answered: the steward kind exists

`policy/task_kinds/origin_confirmation.yaml` defines it:
- `accepts: [accepted, rejected]`, and both verbs require a reason;
- `renders_as.archetype: APPROVAL_TASK`.

`policy/workflows/origin_confirm.yaml` has one `human_await`, and its exclusion of the dropper is structural. Cortex renders the kind through the ordinary approval card, from the served menu, with no kind-specific code. Nothing on cortex's side is owed for the verbs.

## ⛔ Not yet: what the steward was asked to see

The dispatch says: "The steward sees the suggestion with its evidence in the approval card."

- **A case's `human_await` registers its task with no `payload`.**
  - `_register_human_task` (`agent_fleet/restate_analyst/main.py:1627`) builds the body for `/internal/human_tasks/register` without a `payload` field.
  - `HumanTaskRegisterRequest.payload` (`src/iagent/gateway.py:620`) is optional, and `human_task_projection.payload` defaults to `{}`.
- So even once the resolver raises `origin_suggestion`, the steward's row arrives empty. The card draws no suggestion and no evidence, which is the correct behaviour for absent data. The steward would then decide on the title and summary prose alone.

**Ask 3a.** When a `human_await` registers its task, carry the decision's subject matter in `payload`. For `origin_confirm`, that is the trigger's `suggested` and `evidence`.

**Shape: one reconciliation, cortex's opening bid against the trigger's spelling.**

| | key | shape |
|---|---|---|
| cortex reads | `payload.suggestion` | flat scalars, drawn key by key |
| | `payload.evidence` | **a list** of `{source, excerpt?}` |
| trigger declares (`policy/triggers/origin_suggestion.yaml`) | `suggested` | `{owner_domain, program, obtained_via}` |
| | `evidence` | **one object**, `{source, citation}` |

The cheapest reconciliation is on your side, where the payload is built:

```
payload: { suggestion: trigger.suggested, evidence: [ { source: trigger.evidence.source, excerpt: trigger.evidence.citation } ] }
```

**If you'd rather serve the trigger's own spelling, say so, and cortex moves its reader:** read `citation` as well as `excerpt`, and accept a single object as a list of one. What cortex will not do is guess at a payload that isn't served yet.

The capture ask is unchanged: the steward task row as served.

## Found while measuring: the parity seal will need a deliberate producer bump

- cortex's `taskKindParity` seal is red against producer master: `origin_confirmation` is declared upstream and unknown to cortex. CI does not see this, because CI pins `PRODUCER_REF 0f48fe2`, which predates the kind.
- **Pinning the kind on cortex's side alone would turn CI red** through the "every pinned gap is still real" arm, because at `0f48fe2` the kind doesn't exist.
- The bump of `PRODUCER_REF` and the kind's pin have to land in **one** cortex commit, measured against a clean export of the new ref.
- The three openddil-lab overlay kinds below did NOT redden the seal locally, so the default composition does not include overlays. Say whether a deployment that loads the overlay serves them on `/task_kinds`; if it does, cortex accounts for them in the same commit:
  - `maint_fault_approval`
  - `maint_supervisor_approval`
  - `maint_escalation`
- Cortex will do the bump when you name the producer sha that the next roll carries. That is the sha cortex should be sealed against.

## Also relevant to the illustration packet

`maint_fault_propose`'s options cite `outputs.…walk.citations.ipd.part_number`. When the IPD citation gains `icn` and `hotspot_id`, that is the natural point for the ILLUSTRATION component to be raised; see `2026-10-02-packet-to-lane-1-illustration-viewer-built-needs-icn-hotspot-and-a-bytes-route.md`.
