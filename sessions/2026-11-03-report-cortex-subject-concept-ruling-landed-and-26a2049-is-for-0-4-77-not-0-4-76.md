# 2026-11-03: the subject_concept ruling is proved on our side, and 26a2049 goes in 0.4.77, not 0.4.76

Dispatch: "the projector omits `subject_concept` when null (producer side, Lane 1/presentation); cortex excuses nothing."

This supersedes two sections of `2026-11-02-report-cortex-overnight-declared-render-k-of-n-and-document-card-on-master-26a2049.md`: "The digest" and "Needs a decision".

## Correction: my 0.4.76 digest was overtaken

My overnight report said "Pin for 0.4.76: `26a2049`" and "0.4.76 is not cut". That was true when I wrote it, and then the cut happened first.

| Release | Cortex sha | Digest | Read from |
|---|---|---|---|
| `invincible-agent-0.4.76` (tag ce589473) | `e06e08a` | `sha256:2ed53946a4c89f5cd68d675522e41009ec8538706e261b7188bdfec3e94a08f5` | the tag's `values.yaml` |
| 0.4.77 (not cut) | `26a204990572f7d46cb8ee208abb31c0d7327fe9` | `sha256:3077dfa6e73a42658116faf27d29aaf4ad8a8b27f9df82bda192c30722e79104` | GHCR; Lane 1's packet confirms the plan |

**0.4.76 lacks** the declared-render label fix, both k-of-n fixes and the "section review card is not drawn" line.

**Needs Chris:** whether 0.4.77 rolls in place of 0.4.76. The difference on cortex's side is the list above.

## The ruling: no production code changed

Commit `1be74b74edf668f375e51039c6950aff0fdd4f20` changes test files only, and nothing excuses the key.

- **The walk:** `src/archetypes/subjectConceptOmitted.test.tsx` draws all 15 projected archetypes through `SemanticInterpreter`, with the null key and without it. The HTML must be identical once the raw section is lifted out, and that row must be the only one to go.
- **Its reach:** captures cover 5 of the 15 (33 session JSONs, all null). The other 10 use fixtures or hand-written payloads, each with text only its card draws, because two refusals would also compare equal. So those 10 are not proved at the wire.
- **`SOURCE_LEDGER` and `INSTANCES_BY_PROPERTY`** declare no keys and draw no raw section, so they have no row to lose. An arm says so by name.
- **The re-pin seal:** `presentationProvenance.producerSeal.test.ts` reds when the projector stops writing the key unconditionally, and its message names the ruling and what to change. It also compares the walked list to `_PROJECTED_ARCHETYPES`.

What the producer change amounts to: the only production caller passes `subject_concept=None` as a literal (`main.py:1268-1270`), so the key disappears from every projected card. The change is Lane 1's and has not happened; `main.py:1161` at IA origin/master `ee07dfe8` still writes it.

## Evidence

**Gate** (HEAD export plus the five files, against producer `aac9900b`): transport, redproof, tsc, seals and bundle all exit 0. Tests: 4661 passed, 1 skipped, 9 todo, 309 files. Cross-repo arms that ran: 472, did not run: 0.

**CI and digest:** run 41768486598 Build Containers succeeded and Build Frontend ran. `1be74b7` is `sha256:4de150b91ef1d06da3d313580abc2d8c799f2848efc8acc54bc1fd81cb0f90f5`, read from GHCR by the full sha, with `26a2049` resolving to its known digest as the control. This image changes only tests, so no release needs it: **pin `26a2049`, not this one.** The commit carrying this report is sessions-only and has no image.

**Cortex-side mutants, all killed on the message, tree hash unchanged afterwards:**

| Mutant | Reddened |
|---|---|
| Cortex excuses the key | "the row was really there", `declaredRender` |
| Cortex excuses only a null | same |
| `PERIOD_SERIES` needs the key | `PERIOD_SERIES` walk |
| The interpreter needs the key (every archetype) | 16 of 17 |
| Absent prints the word `undefined` | 15 of 17 |
| A hand payload stops reaching its card | "never reached its card" |
| A package population goes empty | `MULTI_SERIES` walk |
| The walked list loses or gains an archetype | seal, "an archetype changed" |

**Omission forms, fired on the scratch producer export, control 11 of 11 green:** key assigned after the literal, conditional spread, `pop` after the literal and `del` after the literal. All four red and name the ruling.

**Known limit:** a generic "drop every None" filter over the component would pass the seal, because it never spells the key. No python on this box, so the seal reads source rather than running the projector.

## Corrections to my own work this beat

- My first version of the seal arm was a plain `toContain`. A conditional spread would have passed it, so it now holds the line form and a count.
- My first run of the omission forms printed "SURVIVED" for all four, and "green" for the control, with 0 tests run: a shell-mangled regex stopped the file compiling. The script now prints NO-MEASURE when the total is 0. The results above are from the re-run.

## Needs a decision

1. **Does 0.4.77 roll in place of 0.4.76?** (above)
2. **The sign-in card for a paused run.** Lane 1's packet (`2026-11-03-packet-to-cortex-from-lane-01-a-paused-run-needs-a-sign-in-on-its-card.md`) says draft #229 "should not roll without either your card or a configured exchange". No dispatch has reached cortex, so nothing is started. It adds two SSE events and a POST, so it would need transport declarations.
3. **A board item for the ruling.** None exists. Whether cortex opens board items is unruled, so the packet asks Lane 1 to.

## Heads-up, not blocking

On the `openddil-lab` overlay's `course` kind, until doc-tools #172 deploys, every course task claims `review_shape: document` with no sections. Reviewers see the amber "not drawn" line at `26a2049` and a silent generic card at `e06e08a`. Promote still works. Lane 1 has this and the choice of whether to hold the row.

## Packets placed (uncommitted, in invincible-agent/sessions)

- `2026-11-03-packet-to-lane-01-from-cortex-the-projector-omits-a-null-subject-concept-cortex-excuses-nothing.md`: new.
- `2026-11-02-packet-to-fin-from-cortex-declared-tcpi-was-labelled-not-declared-fixed-at-26a2049.md`: its raw-row paragraph now says the question is ruled.
