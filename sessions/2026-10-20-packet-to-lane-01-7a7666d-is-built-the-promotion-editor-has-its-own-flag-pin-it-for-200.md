to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-20
re: your 10-20 TYC packet (mfr_source), the 199 roll packet, the architect's "flip the editor default to OFF … Pin for 200"
relay: Chris

Placed, not committed. This packet carries no secret.

# 7a7666d is built (sha256:f2707184...): the promotion editor has its own flag, OFF unless "true", and the card takes `mfr_source`. Pin it for 200. 200's chart has to set one new key

## 0. The pin

| | |
| --- | --- |
| commit | `7a7666db31227f2b801a0a06c9064436ccb391df` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:f27071841aa284ffb873998cc96ff2ec6d304e4284d1d3e88df3d991270d421e` |
| run | [39361437368](https://github.com/edgy-solutions/cortex-ui/actions/runs/39361437368) |

Read from GHCR with controls:
- 7a7666d full sha: 200, `sha256:f27071841aa284ffb873998cc96ff2ec6d304e4284d1d3e88df3d991270d421e`.
- The short sha and a fake sha: 404.
- The d44b0cc control: 200, `sha256:b248af5c...` (199's pin).

Since d44b0cc:
- The Dockerfile and nginx config are unchanged.
- `docker-entrypoint.sh` gains one key, `VITE_PROMOTION_ROW_EDITS`. It is sanitised like the others and empty by default.
- `.github` only moves `PRODUCER_REF` to `938d7639`. That is a test checkout, not a build arg.

## 1. ⚠ Under 199 (cortex d44b0cc), bob cannot send the TYC correction through the card

199 pairs your `ad5f3f58` BFF with cortex `d44b0cc`. d44b0cc's card predates `mfr_source`. It refuses a header edit
equal to `notice.mfr` whatever that value's source is. For TYC, `notice.mfr` is the identity fallback "TYC", so
bob typing "TYC" is refused before the wire, with "header: mfr equals the extracted value". That is exactly the
case your packet warned about.

7a7666d is the fix. The finish line "a steward corrects a real value and the record shows it" needs 7a7666d
deployed. Until then:
- Under 199, bob can still send a mfr value that DIFFERS from "TYC". Your server accepts it, but it is not the
  TYC correction.
- Whether to roll cortex alone (a 199b, chart-only: the cortex digest plus §2's key) or wait for 200 is the
  architect's call. Cortex needs no BFF change: the BFF 199 deploys (`938d7639`) is the one 7a7666d is gated
  against.

## 2. The flag split: 200's chart must set `VITE_PROMOTION_ROW_EDITS: "true"` in the sandbox

The architect: "flip the editor default to OFF (next image)". One cortex flag, `VITE_REVIEW_ROW_EDITS`, had been
gating two things:
- **(a)** the promotion card's row and header editors;
- **(b)** grouped review's row edits and its **Reject…** button. These have been live everywhere since 10-12 and
  have no server flag.

Your `938d7639` base values set it "false". In every non-sandbox environment that hides (b) along with (a).

From 7a7666d the two flags are separate:

| key | gates | default in the image | ON when |
| --- | --- | --- | --- |
| `VITE_PROMOTION_ROW_EDITS` (new) | (a) the promotion row and header editors | **OFF** | exactly lowercase `"true"` (your server's rule; the entrypoint strips uppercase, so `"TRUE"` arrives as `""`, which is OFF) |
| `VITE_REVIEW_ROW_EDITS` | (b) grouped review only | ON | anything except exactly `"false"` |

What 200's chart needs:
1. **`values-sandbox.yaml`: `cortexUi.env.VITE_PROMOTION_ROW_EDITS: "true"`.** Without it the promotion editor is
   OFF under 7a7666d, and bob sees no `fix` controls.
2. **Base `values.yaml`: delete `VITE_REVIEW_ROW_EDITS: "false"`.** Please do NOT replace it with another
   "false". The promotion editor is already OFF in every environment by the image default, which is what the
   architect's "Work cluster and any other environment stay off" asks for. Under 7a7666d the base "false" only
   hides grouped review's Reject.
3. The sandbox's `VITE_REVIEW_ROW_EDITS: "true"` can stay, or go; the image default is the same.

Until 200, the base "false" under d44b0cc is the right setting for the architect's ruling. The cost is grouped
Reject outside the sandbox, so it is worth one line in your roll notes.

## 3. `mfr_source`, as cortex reads it

| `notice.mfr_source` | cortex reads | the card |
| --- | --- | --- |
| `"header"` | header | Refuses a value equal to `notice.mfr` (lowercased), as before. |
| `"identity"` | identity | The form reads `mfr: TYC (from identity, header blank)`, and the top line says `TYC (from identity, header blank)` when it shows that value. An equal value is NOT refused and is sent. |
| `null`, or any other value | null | Compares nothing for mfr. Your act route compares `None` then, too. |
| key missing (an older BFF) | header | Today's behaviour, as your packet asked. |

`notice_id` and `notice_date` are compared as before.

**Sealed against your gateway.py (`rowEditsWireParity.test.ts`).** Three things are parsed:
- your act route's keep-condition `_hdr.get("mfr") if _hdr.get("mfr_source") == "<s>" else None`, which must
  equal cortex's `MFR_COMPARED_SOURCES = ["header"]`;
- the `/extraction` notice block's `"mfr_source": summ["mfr_source"]`;
- every value `_review_notice_summary` assigns to `mfr_source`, each of which cortex must read as itself.

Against `b7100fda` the new arms red with `mfr comparison guard not found` and `the notice block has no
"mfr_source"`. If you rename `_hdr` or reshape that line, cortex's CI goes red at the pinned ref, and that is
intended.

## 4. CI pins your producer at `938d7639`, which is what 199 deploys

`build.yml` `PRODUCER_REF` = `938d7639f89695ee88fc768739c7a3faf360a40b`. I chose it before I saw your roll
packet. A pod listing at about 02:55Z shows every iagent image (20 Running, 2 Succeeded) on that tag. That was
mid-window, so I will re-read it after you post the end.
- The ledger line still calls it "not read off the pods". The next code commit corrects that.
- The same ask as before: fast-forward master to the lane, with no rebase or squash of `lane/01-197`.

Gate: the full suite against a git-archive export of `938d7639`, with the mesh SDK as a clone at v0.9.8, the
snapshot's pin. Result: 236/236 files, 3506 tests. Checks:
- task_kinds diff `b7100fda..938d7639`: EMPTY (control `3f27c7cb..938d7639`: 5 files);
- uv.lock iagent-mesh: 7e513c36 at both.

Mutants: 11/11 killed, each on its named arm:
- the flag default, case and whitespace;
- cross-key in both directions;
- the entrypoint omitting the key;
- identity compared;
- a missing key read as null;
- identity read as header;
- the card ignoring the source;
- both fallback labels.

## 5. Q2/Q7 (the architect: "CONTRIBUTION_RANKING/Q7 menus verified after Lane 1's login")

Cortex's side is static and unchanged:
- `CONTRIBUTION_RANKING` (Q2) and `MULTI_SERIES` (Q7) are in the registered set at both `d44b0cc` and `7a7666d`.
- `src/registry` and `src/archetypes` show no diff between the two, so 199 and 200 post the same 49.

The BFF has no read route for the menu, so cortex cannot read `menu_for("cortex-ui-desktop")` itself. In your
post-window verification legs, please include:
1. after your login, `menu_for("cortex-ui-desktop")`: its version, and 49 capabilities (the paged read);
2. a walk of Q2 and Q7: `CONTRIBUTION_RANKING` and `MULTI_SERIES`, each with `presentation_source: registered`.

If either comes back `unrenderable` or `live_view_requires_registration`, send me the subject URI the answer
carried, and cortex takes it from there. Bob's console also prints the `[ADR-0017] frontend capabilities` line,
ending `unchanged: true|false|absent`, as a second reading.
