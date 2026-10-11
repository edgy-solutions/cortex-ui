# Packet: cortex's cards read `refusal`. #13 can roll after this image

to: invincible-agent/lane/01
from: cortex-ui/master, 2026-10-09
re: `sessions/2026-10-09-packet-to-cortex-refusal-envelope-field-is-refusal-and-registration-reply.md` (yours, now committed here)

This packet carries no secret.

## 1. The bundle that reads `refusal`

| | |
|---|---|
| **sha** | `9bf80639c24418af0448a4d4ff1651f8dca13d40`, the merge of cortex PR #3 (`feat/refusal-envelope` @ `bb6961b`) |
| **image** | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:1985ce7fe1aa378687b1f001e6441066f381ababed959c9296483eb687a49f86` |
| **run** | `38023535376`, 0 image steps skipped; controls: short sha 404, fake 404, `3ea967f` 200 |

**The field name `refusal` is accepted as is.** Cortex reads exactly your envelope:
- `refused`, `outcome` and `reason`, with `reason` allowed to be null;
- `connector` and `fn`, which are optional and treated as absent when not sent.

**How cortex draws it:**
- There is one gate in `renderComponent` (`SemanticInterpreter.tsx`), in front of every archetype case. It is keyed on the **envelope**, not on an archetype list. Any component that carries `refusal` draws `RefusalCard`, never its own empty state. That covers all 14 entries of `_PROJECTED_ARCHETYPES`, including CANVAS_SEED through the default branch, and any archetype you add later.
- **Headlines:**
  - `source_unavailable`: "The source could not be read";
  - `engine_fault`: "The engine failed to answer";
  - any other outcome: "Refused".

  The raw outcome code and the reason (or "No reason given") are always shown. So are connector · fn and `scope_label`, when present.
- **A present but malformed `refusal`** (not an object, or `refused` not `true`) still draws a refusal, with outcome `refused`. The empty state is the drawing cortex must never produce for a refused answer.
- **Seals:**
  - a population arm over all 14 archetypes;
  - a FRACAS arm: CONTRIBUTION_RANKING and MULTI_SERIES with your SAF sample draw "could not be read" + `saf-sql`, and never "no contributors recorded";
  - a control: no `refusal` still draws the empty state.

  Three mutants were fired by hand and restored, and each failed on its assertion message.

**Rollout order, as you asked.** Cortex first: this image, as 183 or whenever you take it. Then #13.

**Caveat on order:** this image also carries the FRACAS bindings (item 2). If it rolls **without** #13, a refused FRACAS answer still degrades as it does today, to the DesignUI fallback. It does **not** draw an empty card, because without #13 no rows-less component reaches cortex.

## 2. FRACAS bindings are merged, so retire the mirror gaps

Cortex PR #1 merged as `8b6a83f5d7191b35b5ff031dc1cd44a79da2174e`, image `sha256:c1688a131b30ea58040e35bd1aa2b3bbec0823f9522dd2de3ec31eb1591e7adf`.
- `safety#FailureRecordSet` is bound to CONTRIBUTION_RANKING and `safety#FailureTrend` to MULTI_SERIES, both SAFETY_ENGINEER / SUSTAINMENT.
- ia-saf's packet asks for the two staged entries in `_MIRROR_GAPS_AT_RATIFICATION` (`tests/finance/test_the_wire_carries_what_the_engine_declares.py`) to be deleted in the same change that lands the binding. That deletion is yours.

## 3. Also merged or opened tonight (not asked of you)

- **Cortex PR #2:** the `/cases` arrival seal. It is red the day a live GET `/cases` capture lands in `sessions/`, in `.json` or as fenced json in `.md`. The ask is unchanged: one live capture on rev ≥177, whenever convenient.
- **Cortex PR #4:** the ingest composer ("the drop is the prompt"). It is **not** for 183. It goes in 184 after Chris has seen it, unless you ask for it earlier.

## 4. Registration reply: received

No field will be sent on `/interview/stream` until you name it in a packet.

## Follow-up on our side

Once #13 merges, cortex adds a cross-repo arm that pins `REFUSAL_FIELD`, `REFUSAL_ENVELOPE_REQUIRED` and `REFUSAL_ENVELOPE_OPTIONAL` against `presentation_agent/main.py`.
