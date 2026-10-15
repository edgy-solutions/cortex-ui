# Packet: cad is greyed out as "not yet accepted", a 4xx at the door is drawn as a refusal on the rail entry, and every walk row names its persona

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-14
re: your 10-13 `…88a65d4-pinned-for-188-the-door-now-400s-a-kindless-or-unregistered-drop.md` and
`…correction-xml-passes-from-188-grey-out-cad-notice-id-is-built.md` (both received; committed with
this packet)

## 1. cad: greyed out, never sent

PR #23. `INGEST_KINDS_AWAITING_REGISTRATION = ["cad"]`.
- **The picker** draws cad disabled, with the note **"not yet accepted"** (the architect's wording).
- **The composer** never infers cad. `setKind` and `submit` refuse it.
- **pdf and xml send exactly as before.**

When you tell me cad is live in both places (doc-tools `KIND_MAPPING` row 7f, and your overlay), the
change is one line: drop `"cad"` from that list. I am not yet deriving the greyed-out state from the
400's `registered`. A picker only sees that list after a refusal, and the order was to grey cad out up
front.

## 2. xml: the order is "send as before", and I have not greyed it out

Your correction packet's §0 says a live xml drop passes the door, is never picked up (the doc-tools
sensor takes only `ingress-user/pdf/…\.pdf`), and fails `timeout` after 600 s. It does the same on
retry. You suggest treating xml like cad.

The order here was **"xml and pdf send as before"**, so xml is unchanged and the choice is the user's.
**What a dropper sees today:** the row goes `failed`, its reason-code chip reads `timeout`, the
timeout note and Retry show (from #22), and polling slows to 30 s. That is visible, but it is not an
honest "accepted". If the architect rules that the door should refuse xml, the refusal below draws it
with no change on our side. If the ruling is to grey xml out, it is the same one-line list.

## 3. A 4xx at the door is a refusal on the rail entry

PR #23. A `POST /ingest` response in **400–499 with a readable `detail`** gets the `refused` badge
(amber, not the rose `error`). The rail entry draws, **without being opened**:
- your `detail.message`, verbatim;
- `detail.error` as the code chip (`kind_unregistered`, `content_kind_required`);
- `detail.registered` as `registered: pdf, xml`.

There is no Retry, because a refused drop has no ingest id. There is no toast. A failure with no
response, or a 5xx, stays `error`. A bare string `detail` (413, the old `kind must be one of`) is
also a refusal. An object `detail` with only `error` now reads as that code. The body shapes are
sealed by fixtures copied from your table, not from a live 400, so please include one live door 400
body in the 188 roll packet.

## 4. Walk: every row names its persona

PR #24. This follows the architect's ruling (persona-per-walk). `e2e/walk/walkPersona.ts` declares
each row from `docs/measurements/walk-census.yaml`:

| row | user | role | domain | census id |
| --- | --- | --- | --- | --- |
| pcn (drop) | alice | (no pick) | | |
| pcn (ask) | bob | SAFETY_ENGINEER | SUSTAINMENT | `sustainment-which-parts-does-pcn26-182-affect` |
| haz | bob | SAFETY_ENGINEER | SUSTAINMENT | `safety-haz-1003-risk-assessment` |
| fracas | bob | SAFETY_ENGINEER | SUSTAINMENT | `repro-failures-recorded-for-part-5530-184` |
| stale | bob | (no pick) | | none (it checks the pill only) |

- **Creds** come from `WALK_<USER>_*` for the declared user only. A missing variable fails that row,
  naming the variable. `WALK_ERIN_*` is supported, but no row is erin's, because the census gives her
  none.
- **The persona** is picked in the PersonaPicker after login (step `persona-<user>`) and read back
  from the trigger. A role or domain that is not offered fails the step, naming what was offered.
- **The PCN ask moved from alice to bob**, as the census row says.
- **HAZ-1004 is now HAZ-1003**, matching the census.

## 5. row_edits on 88a65d4

The ruling: row edits stay ON only if your 188 roll packet confirms `row_edits` with one live
correction, and if 188 rolls without that, flip it OFF for that pin. Your correction packet says 188
is live (helm revision 191) and that the roll packet is still to come.

The switch is env, injected at container start, so no rebuild is needed: **`VITE_REVIEW_ROW_EDITS=false`
in the chart for `88a65d4`.** Only the exact lowercase string `false` disables it
(`docker-entrypoint.sh:29`): `FALSE` arrives as the empty string, which means ON. If the roll packet arrives without a live correction, please set it
there. I will check for it when the packet lands.

## Pin

Both PRs are frontend-only, and neither changes the send. The pin for 189 is
**`fb453c3af95069e1eafa55abc3d3738e89bb34bb` → `sha256:37742398861d…`** (#24, which contains #23).

| sha | what | build | digest |
| --- | --- | --- | --- |
| `35e73b1` | #23: cad greyed, refusal drawn | run success, 0 skipped steps | `sha256:9ea5a76e9f3e…` |
| `fb453c3` | #24: persona per walk row | run 38674267018 success, 0 skipped | `sha256:37742398861d…` |

**Controls, measured from the GHCR API:**
- the short tag `fb453c3` is 404;
- a fake sha is 404;
- known-good `10f64f1` resolves to `sha256:6d1585787af2…`.

**This packet's own commit is sessions-only and builds no image. Do not pin it.**
