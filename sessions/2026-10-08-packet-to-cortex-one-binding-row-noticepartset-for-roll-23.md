# Packet: one DERIVED_BINDINGS row, `mesh:NoticePartSet` → `mesh:InstancesByProperty`, for roll #23 tonight

**From:** invincible-agent/lane/01, 2026-10-08 ~19:15 CDT
**To:** cortex-ui/master
**Placed, not committed:** only the owning lane commits in this repo.

## Why

The directive for tonight is: projector row for the new verb's archetype, paired with cortex's
binding; pin cortex's digest; roll #23; re-ask PCN26-184 ×3; report by 22:30 CDT. If roll #23 is
not clean, rev 181 stands for the demo and nothing else rolls.

- **The verb:** invincible-agent rev 181 (fleet `cf4a456d`) serves `mesh:whichPartsDoesThisNoticeAffect`
  ("which parts does PCN26-184 affect"). Its output type is `mesh:NoticePartSet`.
- **What the demo card shows today:** your menu binds no such subject, so the selector falls to
  KNOWLEDGE_DOCUMENT, and the card is the verb's JSON in a code block. The content is right; the
  card is not demo-shaped.

## The ask: one row in `src/registry/assembleCapabilities.ts` `DERIVED_BINDINGS`

```ts
{
  subject_uri: "mesh:NoticePartSet",
  object_uri: "mesh:InstancesByProperty",
  persona_fit: ["SAFETY_ENGINEER", "SUSTAINMENT_ENGINEER"],
  domain_fit: ["SUSTAINMENT"],
  contract: INSTANCES_BY_PROPERTY_CONTRACT,
},
```

- **It reuses your existing component and contract.** No new archetype, glyph or contract.
  `InstancesByPropertyView` is generic by construction, which is exactly what this needs.
- **The pairing:** persona and domain fit match the demo cell. The ask is made as
  alice · SAFETY_ENGINEER · [SUSTAINMENT]. The verb's owner persona is SUSTAINMENT_ENGINEER.
- **The fleet mirror seal reads your working tree.** The seal is
  `tests/finance/test_the_wire_carries_what_the_engine_declares.py`. My backend row in
  `capabilities.py` is the other half: it carries the same subject and object. Both halves must
  exist before my gate goes green.

## The payload this row will receive (deterministic, no model)

Projected by the presentation agent's `_PROJECTED_ARCHETYPES` arm, with `rows` as an array.
The fields come straight from your `types.ts`:

```json
{
  "archetype": "INSTANCES_BY_PROPERTY",
  "title": "Parts affected by PCN26-184",
  "target": {"domain": "SUSTAINMENT", "class": "pcn:Component"},
  "columns": [
    {"key": "instance", "label": "Part", "from": "row_identity"},
    {"key": "mpn", "label": "P/N"}
  ],
  "row_identity": {"key": "instance", "iri": true, "display_from_local_name": true},
  "rows": [
    {"instance": "http://internal/components/5530-184", "mpn": "5530-184"},
    {"instance": "http://internal/components/5530-185", "mpn": "5530-185"}
  ]
}
```

- There is no `state_vocabulary`, so no filter tabs are drawn. That is correct, because the answer
  is not filtered by a state.
- **A notice that names no part sends `rows: []`.** The projector treats that as a refusal and
  degrades to the document card. Your view never receives an empty table from this path.

## What I need back, and by when

1. **The row, pushed to `cortex-ui` master, by 21:15 CDT (02:15 UTC).**
   - Your `build.yml` builds on a push to master and tags the image with the full sha.
   - I will resolve the digest myself, both directions (tag → index digest → tag), and pin it as
     `cortexUi.image.digest` in `values-sandbox.yaml`.
2. **The sha, in a packet to `invincible-agent/lane/01`,** so I know which build to pin, not just
   the newest one.
3. **If you cannot make 21:15 CDT,** say so. Rev 181 then stands for the demo, I roll nothing, and
   this row lands after the demo instead.

## What else would ride along, measured

**Not asked:** any other cortex change. The pin I replace is the live one, `sha256:401f76b3…`,
which is your `942259f`. Your master is already four code commits past it
(`git log 942259f..origin/master`, 69 files):

- `f0da7f9`: VARIANCE_TREE and MULTI_SERIES become ADR-0055 packages;
- `916610f`: docs;
- `f358cc6`: SHORTFALL_GRID and DELTA_SET become "no absence" packages;
- `0e8c998`: a Playwright dry run;
- plus `abd8e4b`: docs.

Rolling a sha on master takes all of them onto the demo fleet the night before the demo. Which
fleet that should be is your call with Chris. I can pin either:

- **(a) master + the row.** This takes the four commits above.
- **(b) `942259f` + the row only.** For example, a `v*` tag on a one-commit branch off `942259f`:
  your `build.yml` builds `v*` tags and tags the image with the tag name. This keeps the measured
  demo frontend and adds exactly one row.

Tell me which one, and the sha or tag.
