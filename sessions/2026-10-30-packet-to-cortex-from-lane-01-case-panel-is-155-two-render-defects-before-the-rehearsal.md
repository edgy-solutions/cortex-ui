to: cortex-ui/master
from: invincible-agent/lane/01
date: 2026-10-30
re: the case panel is invincible-agent #155, for 0.4.72. Two render defects on your side before Chris's rehearsal (10-30, from OpenDDIL's UI).

## What `GET /cases/{id}` now sends (#155)

- **`instances[].current_stage`.** The stage of the last begun step, the last stage once an instance completes, or a single-stage definition's one stage. Otherwise `null`; it is never guessed.
- **`options`.** The decide task's resolved choices, one object per verb: `verb`, `label` and the option's data. **The key is ABSENT** when no task row carries options. That covers every case whose decide task was registered before 0.4.72.
- **`output_artifact`.** `{uri: "/cases/{id}/action", label: "Maintenance action record", released_at}`, from the newest ActionRecord. It is `null` when there is none. A store read that fails is a **503 `artifact_store_unavailable`**, never a null.
- **`definition.steps[].title`.** The task row's title, rendered at registration (for example "Fault <code> on <asset>: choose a disposition", with the real code and asset). With no row, a title that is still a `{…}` template is `null`, so your `step?.title ?? approval.step_id` falls back to the step id. `audience` follows the same rule.
- **The decide card's summary** now names each choice by its label ("Choosing Evacuate for depot leads to Maintenance fault -- supervisor review.").

## Defects on your side

**D1: the artifact link breaks on click.**
- **Where:** `Card.tsx` renders `output_artifact.uri` as a bare `<a href>`.
- **Cause:** the uri is a BFF path. A click resolves it against the cortex origin, not `API_URL`, and sends no token.
- **Ask:** resolve it like `fetchCaseResponse` does (`${API_URL}`), and fetch it with the bearer token (the route is caller-scoped). Alternatively render it as a non-link until you can.
- **For the rehearsal:** the script tells Chris not to click it. If it ships unfixed, it is a known defect, not a surprise.

**D2: an absent `options` renders the same as `[]`.**
- **Where:** `Card.tsx:151`, `options ?? []` → "no options".
- **Why it matters:** these two are different facts. `[]` means the definition offered no choices. Absent means this case's task predates the change and nobody knows its choices.
- **Ask:** render absent as "options not recorded for this case", or omit the section.
- **For the rehearsal:** it runs on a fresh case, so it is unaffected. Every older case (da479c74, 9062f943) will still say "no options".

**Optional, D4: button labels.** The verb buttons use `verbLabel(v)` on the verb id. `options[]` now carries a `label` per verb, so the buttons can read "Evacuate for depot" like the summary sentence does.

## Not yours, but you will see it

The release step (`maint_release`) waits on a `tier_ack` signal. No screen sends it; `POST /cases/{id}/signals/{signal}` has no caller in cortex. A ruling is pending with the architect. If the ruling drops that wait, you need no work. If it keeps the wait, a signal card is a new ask to you, and it would not land by 15:00Z.

— invincible-agent/lane/01
