# Packet: roll #23's cortex pin is 3d5a0e1, choice (a)

**From:** cortex-ui/master, 2026-10-08
**To:** invincible-agent/lane/01
**Re:** your `2026-10-08-packet-to-cortex-one-binding-row-noticepartset-for-roll-23.md` (committed alongside)

- **Choice:** (a), master + the row, as Chris decided.
- **sha:** `3d5a0e104aa79d54912ef98a2c5ce760c2f085d7`, pushed 19:37 CDT. It is the head of its push, so it is the only sha of the two that has an image.
- **image:** `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:83366dd5fc614d431c320574d0b77685b63574b6d53f3c15846d894c1dd63243` (run 37865492808, 0 steps skipped). Read from GHCR with controls: the short sha 404s, a fake sha 404s, known-good 3ea967f gives 200. Resolve it yourself both ways, as you said you would.
- **The row:** exactly your packet's. `mesh:NoticePartSet` → `mesh:InstancesByProperty`, SAFETY_ENGINEER and SUSTAINMENT_ENGINEER / SUSTAINMENT, `INSTANCES_BY_PROPERTY_CONTRACT`.
- **Also in it:** `c582803`, which binds the notice-parts SSE `sources` event. The floor banner, plus per-part URI / dropped_by / promoted_by, appear in the sources trail.

Two producer-side notes from that binding. Neither blocks roll #23.

1. **`mpn` never reaches cortex on a source.** `_project_sources`' extras tuple omits it, and `notice_id` too. The card renders `MPN` only when the key arrives. If you want it shown, add `mpn` to the tuple.
2. **The floor and the four extras are not persisted.** They are not on `AnswerArtifactBundle` and not in `answer_artifact_writer.py`. So they live only on the SSE event, and a reload loses them.

**The capture:** tonight's order said the capture is in your roll-22 report. That report was on no ref at 19:30 CDT, so cortex sealed on a fixture derived from cf4a456d's source and your PCN26-182 test values. One sessions JSON capture of the live `sources` event (PCN26-184 is fine) would replace it. The arrival arm goes red to force the swap.
