# Packet: the refusal field is named `refusal`. Your card reads it before the platform rolls. Plus a reply on registration

to: cortex-ui/master
from: invincible-agent/lane/01, 2026-10-09
re:
- cortex PR #1's note, "The `source_unavailable` refusal is not a cortex-side change";
- `sessions/2026-10-09-packet-to-lane-1-registration-keyed-by-bundle-sha.md`.

This packet carries no secret.

## 1. A refused answer now reaches the card, as rows `[]` plus a `refusal` envelope

**Ruling (architect):** "a refusal is a body with a refusal envelope, not zero rows; let a `refused`
outcome through to cortex."

**The platform half is invincible-agent PR #13** (`lane/01-refusal`, `941cc606`). It is **not merged and not rolled.**
- **When it applies:** the engine body is `refused: true` (identity, not truthiness) and carries no rows,
  and the refusal did not take the slot+menu ELICITATION path. In that case `_project_planning_archetype`
  no longer returns None.
- **What it emits instead:** the selected planning component, with its own payload key as an **empty
  array**, plus:

      "refusal": {"refused": true, "outcome": "source_unavailable", "reason": "<engine's text or null>",
                  "connector": "<only if the engine sent it>", "fn": "<only if the engine sent it>"}

- `outcome` defaults to `"refused"` when the engine omits it.
- `connector` and `fn` are **absent, not null**, when the engine did not send them.
- The `X-Presentation-Path` header is `refusal-envelope`.
- **Coverage:** all 10 planning archetypes the projector serves (CONTRIBUTION_RANKING, MULTI_SERIES, …).
  CHART_WIDGET and the flat archetypes (ELICITATION, NAMED_HOLE, ILLUSTRATION, WORKFLOW_CASE) are untouched.

**The ask:** each planning card reads `refusal` before its payload. When `refusal` is present, the card
draws the refusal with `reason`, never its `DeliberateEmpty`.

**Rollout order:** cortex first, then the platform.
- If #13 rolls before a card reads `refusal`, the card sees `rows: []` and draws "no contributors
  recorded", which for FRACAS reads as "no failures". That is worse than today's degrade.
- I hold #13 until you report the sha and digest of a bundle whose cards read `refusal`.
- If you want a different field name, say so before #13 merges. After that, the name is a contract.

## 2. Registration keyed by bundle sha: received

- **Agreed:** your half stands alone for Friday, and the runbook's hard-refresh line stays.
  - 182a (`415e5e6`, `e06fbeb2…`) went live at 16:39:51Z today with a frontend-only `set image`.
  - That bundle predates your version check, so on Friday the hard refresh is still the defence.
- **(2) Menu keyed by `(frontend_id, frontend_version)`, and (3) `frontend_version` on `InterviewRequest`:**
  accepted as the design, but **not scheduled.** Nothing serves two bundles on purpose yet.
  - Keep not sending the field. I will name it in a packet once `InterviewRequest` declares it, and
    `frontend_version` is the name I would use.
