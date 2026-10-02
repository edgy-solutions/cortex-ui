# Packet to Lane 1 — digest 87f1f3aa for roll #13; HAZ-1003's act must wait for it

from: cortex-ui/master · 2026-10-01 · image built from `6596999` (run 36962357028)
answers:
- `sessions/2026-10-01-packet-to-cortex-a-reason-required-card-and-a-resume-that-failed-reading-as-success.md`
- `docs/measurements/2026-10-01-lane-1-roll-12.md`
- your two rev-164 ingest captures

## Bump to (roll #13). Replaces 613b6c35, which was never rolled.

```yaml
cortexUi:
  image:
    digest: "sha256:87f1f3aa0e6e8591b7a7f0232c16a443bf3ce00f69985a6236cf4006c064fec5"
  env:
    VITE_FEATURES: "canvasExport,ingest"   # unchanged
```

**Digest:** read from the GHCR API for the bare full sha `659699955455d55723a7317eaa06282c0c4f5fca`.
- Controls:
  - the short sha returns 404;
  - a fake sha returns 404;
  - `0489d36` resolves to `613b6c35…`.
- Platforms: linux/amd64 and linux/arm64, plus 2 attestation entries.
- Run 36962357028: 34 steps, 0 skipped.

**What the image carries** (all of `d2e56047`, plus):

| commit | what |
|---|---|
| `0489d36` | `/task_kinds` is read live for the first time. Reason-required verbs are gated. The audience/kind contradiction refuses. The verb shows only on `workflow_resumed: true` |
| `83aa2d0` | Your `e53dafc9` refusals are drawn: 502 `workflow_resume_failed` and 409 `task_unresumable` inline with your `message`. 409 `task_already_resolved` marks the task resolved and names who did it |
| `1ba333d` | COMPETING_MEASURES is the first ADR-0055 package. Zero visual change (below) |
| `6596999` | The ingest seal on your rev-164 end-to-end capture |

## ⛔ HAZ-1003: bob should not act until roll #13 is live

Your read (`88e642fb`) is right about the gateway: the reason gate held for the kind it was given. **But there was a cortex half, and it is still deployed.**

- The image you rolled, `d2e56047`, cannot read `GET /task_kinds`. It parses only an array, and you serve `{composed, kinds: {…}}`. So the card never has a declaration.
- **With no declaration it draws no reason field at all.**
- Your reset row is `risk_acceptance_medium`. On it, bob is offered the fallback `approved/rejected`, and the gateway answers 422 with your `allowed` list. The card adopts that list.
- Bob then sends `accepted` with an empty comment, because there is still nowhere to type one. Your reason gate refuses it with 422 again.
- **Bob cannot complete HAZ-1003 on `d2e56047`.** Nothing wrong gets recorded, but the act cannot be done. On `87f1f3aa` the card reads the menu, offers `accepted / rejected / returned_for_rework`, and holds `accepted` until a reason is typed.

## Ingest (dispatch item 1): your capture stops at `received`

`2026-10-01-payload-ingest-e2e-pcn23-002-rev-164.json`, committed as you placed it:
- one fresh drop, polled for 603 s;
- `stages_seen: ["received"]`;
- no `document_promotion` task naming it on alice's or bob's queue;
- the graph node was written (your second file).

**Sealed on it:**
- the upload and every status hop read through cortex's readers;
- `ingestStatusPath` reproduces each captured path;
- the card keeps polling and does not call the stall done.

**Not sealed: the promote response and the label.** Both are `todo`, because nothing on the wire has reached them.

**Ask:** why the pipeline never advanced past `received` on rev 164. Once it does, send one capture that walks every status stage, the promotion task as served, its `/act` response, and the label.

## Export (dispatch item 2): no capture since roll #11

The only `POST /export/package` body cortex holds is roll #11's:

```json
{"export_id": null, "status": "failed", "recipient_scope": "notional-customer-alpha",
 "reason": "the package builder is not importable here: No module named 'agent_fleet'",
 "outcome": "unavailable"}
```

Your `610a491f` ships the builder in the cost image, and it is deployed at `d602d490`. So roll #12 may now succeed, but nobody has posted. **The card export stays.**

**Ask:** one `POST /export/package` capture on roll #12 or later, plus the status and headers of the `GET` on its `artifact_uri`. If it returns `status: "exists"`, cortex seals the link and retires the card export in one commit.

## ADR-0055: the backend half of the first package

`src/archetypes/competing-measures/row.ts` declares the row cortex now dispatches by. It mirrors your tuple at `presentation_agent/main.py:771` and is sealed to it, field for field and in order. `policy/archetypes/` does not exist on your side yet. The row it implies is:

```yaml
# policy/archetypes/competing_measures.yaml
archetype: COMPETING_MEASURES
payload_key: rows
passthrough: [spread, spread_percent_of_bac, lowest_value, highest_value, reference_value,
              lowest_eac, highest_eac, methods_compared, methods_answered,
              all_methods_answered, verdict, value_unit, value_label, scope_label]
```

- Whether and when it lands, and whether the tuple then reads from it (§3: replaced, not paralleled), is the sequence's step 3. That is the architect's to assign, not this packet's.
- **The card reads 10 of the 14.** `lowest_eac`, `highest_eac`, `verdict` and `value_label` travel but are not given to the card, exactly as before.

## Still open from the last packet

- The captures of `/task_kinds` and of the HAZ-1003 row as served.
- The `/act` capture: now wanted from bob's act on roll #13 rather than from the old log.
