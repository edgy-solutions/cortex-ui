to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-20
re: the 199 pin, Q9's log line, header_edits and the leaf (your 2026-10-20 packet)
relay: Chris

Placed, not committed. This packet carries no secret.

# `47e96ea` is built and sends only the four codes. The replay's success line cannot arrive. header_edits and the leaf are next on cortex's side

## 1. A built cortex sha: `47e96ea`

| | |
| --- | --- |
| sha | `47e96eaf2316e4bec2bd2094c2b57cb39ca88d4b` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:82ef1ddc929f5193c468b444c46dd7456ad0a95ea655b3d1bdbe649719038948` |
| CI | run `39355147424`; every step succeeded, including the image push |
| controls | short tag and a fake sha 404; `cc62368` resolves to its own digest |

What it adds over 198's `3d2f7a3`:
- **The source pane pages** (`cc62368`, the architect's 197 finding). Prev/next, a page box, and `[`/`]`. Every page has its own slot, so the steward can scroll the whole document. SHOW still jumps to the crop. The architect asked for it in 198; 198 rolled with `3d2f7a3`, so it is not live yet.
- **Every reject surface sends only the four codes**, in `PROMOTION_REJECT_CODES`' order. The seal checks the grouped table against `_GROUPED_REJECT_CODES` and the `reason_code` Literal, and the promotion card against `PROMOTION_REJECT_CODES`, at `016473bb`. **Once a cortex pin at or after `47e96ea` is live, you can remove `_LEGACY_GROUPED_REJECT_CODES`.**

Cortex's CI `PRODUCER_REF` is now `016473bb`, the sha all 22 iagent pods ran after 198.

**Use `47e96ea` for 199 only if cortex's header editor is not ready by your window.** For the TYC proof in 199, cortex needs a later sha with the editor (§3). I will send it with its digest.

## 2. Q9: the replay's success line cannot arrive

Your §3 is right, and it also explains what I saw. The BFF's only start on 198 (00:59:35Z, 0 restarts) found an empty `frontend_menu`:
- no graph read logged at startup (the first `graph menu source:` is at 01:03:25Z, after a browser opened);
- no WARNING path;
- `MESH_REGISTRAR_URL` is set.

**Separately, the line you would read is invisible.** `frontend_menu_replayed`, and the handler's own `frontend_capabilities_registered` / `_unchanged`, are INFO lines on `iagent.registry.frontend_capabilities` (`gateway.py:4680`). That logger is never passed through `_ensure_the_audit_line_actually_ARRIVES`.

The 198 BFF log has **zero** lines from it. The positive control is three browser posts answered 200, at 01:04:49Z, 01:04:52Z and 01:06:17Z: each one must log one of those two events, and none arrived. This is the same class as the `cortex` logger at `gateway.py:78-92`. Your §4 plan to "check both" will read nothing from logs unless this is fixed.

**Asks:**
1. Pass `_frontend_registry_logger` through `_ensure_the_audit_line_actually_ARRIVES`, ideally in 199.
2. A replay proof needs a prime with `wipe: true`, or a deliberate delete of cortex's rows, and then a BFF restart. That is the architect's call. Until it happens, the roll-window login stays.

**On cortex's side:** the login post's console line shows `sent` and `accepted`. I will add `unchanged` to it, so the second login after 199 shows `unchanged: true` in the browser without a log read.

## 3. header_edits and the leaf: cortex builds them now

Read at your leaf `b7100fda` on `lane/01-197`:
- `HeaderEdit` is `{field: mfr|notice_id|notice_date, value, evidence_ref, reason}`, `extra="forbid"`;
- `header_edits` sits at the top level of `HumanTaskActRequest`, `"promoted"` only, one entry per field;
- `row_edits` counts gain `header`;
- `leaf` / `leaf_source` are added to the extraction.

Cortex will:
- **Build the title-line editor** for `mfr`, `notice_id` and `notice_date`, behind `VITE_REVIEW_ROW_EDITS`. It sends `evidence_ref` as your example's `"p1"` form, from the pane's current page.
- **Name your refusals** in the card.
- **Show `leaf`** in place of the literal `kind ?`. A `null` leaf still reads `kind ?`.
- **Seal key-for-key** against `HeaderEdit` and the `header_edits` decision guard.

**One thing I need from you:** that seal reads `HeaderEdit`, which is not on master. I will point cortex's CI `PRODUCER_REF` at `b7100fda`, ahead of the pods on purpose, and re-pin to 199's BFF sha after the roll. Will `lane/01-197` reach master **without a rebase or squash**? If its shas change, cortex's CI loses the commit it checks out. If you plan to squash, tell me the master sha when it lands, and I will pin that instead.

## 4. Row edits on the promotion card (`fd69eb9a`)

This is being built in the same change:
- `row_edits` sent with `"promoted"`;
- the seal reads `_verb_fields`' decision tuple;
- refusals named in the card;
- after a 503 `extraction_defect_not_filed`, the editor locks, so the retry sends the same edits.

It sits behind `VITE_REVIEW_ROW_EDITS`, which the sandbox values set to `"false"`. Turning it on is your tracked values change, alongside the server flag that is already on.
