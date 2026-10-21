# 2026-10-20 report — cortex-ui/master: 26bce42 built for 201; a refused answer is the refusal block only; no card dumps JSON

Written for: the architect and Lanes 1 and 74, plus whoever picks up this lane next.

## The architect's 201 list, and Chris's screenshot

| item | state |
| --- | --- |
| a render for `safety#RiskAssessmentDraft` | done. It is keyed by `output_uri` inside KNOWLEDGE_DOCUMENT's fenced reply, with the producer's vocabulary (II/D → Medium, `safety_risk_matrix.ttl`, three-state `verified_in_field`) |
| FailureRecord results (Q6/Q7) | done. A FailureRecordSet render (part · count, records by date with source refs); `safety:FailureRecordSet` rebound to KNOWLEDGE_DOCUMENT. **This flips the producer's mirror row `capabilities.py:560`**: asked in packet §4 |
| CONTRIBUTION_RANKING (Q2) | unchanged; it already had a render. The no-JSON census covers it |
| the fallback is never raw JSON | done. StructuredFields, with "no render registered for X" or "X render not drawn: why" |
| Chris: a refused answer is the refusal block only | done. Rev 186's "prose beneath" is superseded, and raw fields are suppressed under a refusal |
| 74: does the draft declare its archetype by `output_uri`? | answered from the pinned source (`safety_agent/main.py:856`, spec :201). Live confirmation asked |
| review task as a link by case_id/kind | built. Links `/case/<id>` when `case_id` arrives; there is none at 938d7639. Per the item-4 ruling ("the card carries `case_id`"), Lane 1 is asked where |
| pin for 201 | 26bce42, `sha256:929338009a27e9fbf9f9d6a59e4f29d2a44dbe9b6d6104676d2e7a8b53feb5c3`, run [39540955942](https://github.com/edgy-solutions/cortex-ui/actions/runs/39540955942) |

## Why there are no new archetypes

`capability_admission.py` `KNOWN_ARCHETYPES` drops any capability row whose archetype the backend doesn't know. A cortex-first RISK_ASSESSMENT_DRAFT would have widened the subject to `unrenderable`. The renders read the reply's fields, so promoting them later is a menu change, done in the runbook's order. The producer goes first.

## Commits

- `26bce42` feat(render): a refused answer is the refusal block only; renders for RiskAssessmentDraft and FailureRecordSet; no card dumps JSON.
  - Gate: 240/240 files and 3567 tests against a git-archive export of 938d7639 (mesh SDK at v0.9.8), plus tsc, transport (10 sites) and build:bundle.
  - Mutants: 12/12 killed on the named arm and reason. The fence-count check is a recorded equivalent.
  - CI: run [39540955942](https://github.com/edgy-solutions/cortex-ui/actions/runs/39540955942), every step green (none skipped), image pushed; GHCR: the full sha 200 `sha256:929338009a27e9fbf9f9d6a59e4f29d2a44dbe9b6d6104676d2e7a8b53feb5c3`, the short and a fake sha 404, the 7a7666d control 200 `sha256:f2707184...`.
- This report and the packet copy: docs(sessions). They build no image.

## Packet

`sessions/2026-10-20-packet-to-lane-01-and-74-26bce42-is-built-refusal-only-no-json-dumps-pin-it-for-201.md` is placed identically in invincible-agent/sessions/, uncommitted.

## Defects found on the way (fixed in 26bce42)

- The first fixtures used invented vocabulary: Critical/Occasional/High, a boolean `verified_in_field`, "fracas-a". They were rewritten from `measures.py`/`entities.py` at 938d7639, and an arm now proves a boolean `verified_in_field` is NOT read as the vocabulary.
- Four "card drew" assertions used a NOT_FOUND matcher that a package fall-through could satisfy (the actedOn seal and three Card tests). They now match `/no render registered for|render not drawn/`.

## Open

1. Lane 1 and 74: the `capabilities.py:560` mirror row (flip it, or carry the records in the ranking projection).
2. 74: confirm `output_uri` is in a live KNOWLEDGE_DOCUMENT fenced reply.
3. Lane 1: where the card's `case_id` sits.
4. A live HAZ-1003 draft body and a non-refused FailureRecordSet body, to replace the derived fixtures.
5. Carried from 200:
   - Lane 1's Q2/Q7 menu result;
   - a Chromium probe of the promotion editor on the published image;
   - the architect's 199b-versus-200 decision.
6. Not in 201: Lane 1's 10-21 packet to cortex-ui/lane/ca (`evidence_ref` on every row-edit op) is in sessions/, untracked and unanswered. It is a separate wire change.
