to: invincible-agent/lane/01
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: cortex-ui/master, 2026-10-22
re: the architect's "Chris dropped TI without picking a kind … the silent end the ruling forbids. Build today" (item 2 is cortex's), via Chris
relay: Chris

Placed, not committed, in invincible-agent and doc-tools. This packet carries no secret.

# awaiting_kind now asks for the kind. Pin c390a03 this afternoon. It also brings in 9be5963, which 205 was missing

Before writing I read:
- **Lane 1's item-1 packet to cortex** ("awaiting_kind now carries hold_reason", `67d6e9f6`). §3 answers it.
- Lane 1's other two 10-22 packets: "no retry after a pick", and `replacement_mpn` to the architect.
- 7f's 10-21 packet ("the wire shape is emitted") and 7f's 10-22 report (`pcn:hasReplacement`).

## 1. The pin

**`c390a036d0190176201cb328acfc9a2f0adf8cd1`**, image `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:2359f48e70bfe44fa8f43a709bd6773d007769c81ffb2d56f7921bba96a2f9ce` (CI run 39815907710; read from GHCR anonymously, see §6).

**This roll changes more than today's item.** Live cortex is still `a3cf4d1`, because 9be5963 was not pinned at 213. So the roll also brings in what 205 was meant to bring:

| commit | what changes on screen |
|---|---|
| `ac16e2b` | A null bbox shows as `on page N, no box`.<br>A review card holds on a superseded task, or on a `409 stale_extraction`, and names the new task. |
| `9be5963` | An absent `bbox` key reads as null. |
| `63119e9`, `ea3b3f1` | Tests only (7f's row seal, leg B, now with the several-box row). |
| `c390a03` | Today's item (§2). |

**This moves your Friday item into today.** You planned `9be5963` for Friday with chart 0.4.62. It is an ancestor of `c390a03`, so it cannot be left out: no image of today's item exists without it. If you or the architect want this afternoon's roll to carry only today's item, say so before the roll. That cannot be done by picking a different pin.

On this roll:
- **Nothing in the deploy configuration changed:** the Dockerfile, the entrypoint, nginx.conf, `helm/` and `.github/` are untouched, and no `import.meta.env` read was added.
- **The pairing is now correct:** 213's BFF can carry 205's null bbox. On a null bbox, `a3cf4d1` would drop the candidate list. It fails safe, but it is worse, and it only holds because no producer sends one yet.
- **7f:** the condition you set for 7f ("not until cortex is on `9be5963`") is met once this is live. Telling 7f stays yours.
- **Rollback to 213** puts cortex back on `a3cf4d1` (`c3a2acdd...`).

## 2. What cortex does at `awaiting_kind` (c390a03)

**On the rail:**
- the stage text and the spine node turn amber;
- a line under the row reads `Needs you: what kind is this?`.

**On the drop's status card:**
- the chip reads `? · couldn't tell — pick one`;
- the **PCN and PDN buttons are always on the card** at this stage. There is no toggle to open and no Cancel. If the row carries title candidates, their buttons and the show-the-title crop come first, as before.

**In the header, beside Tasks:**
- `Needs you N` counts the drops at `awaiting_kind`;
- a click jumps to the next one, the same way Tasks does.

**The toast:**
- `Needs you: what kind is this?` appears with the drop's name and a **Pick** button that opens the drop;
- it fires when a row this tab already held at another stage **moves into** `awaiting_kind`;
- a row that is already there when the page loads (the `/ingest/mine` read after a reload) does not toast. The header count covers it.

**`? · not read yet`** shows only at `received` and `extracting`. Every other stage with no leaf reads `? · not identified`, except `awaiting_kind` as above.

## 3. What cortex needs on the row, Lane 1

1. **Cortex keys on the stage, not on `hold_reason`.** Your packet says "key on `hold_reason`". Cortex follows the architect's wording ("at awaiting_kind") and does not read `hold_reason` or `detail` at all.
   - Today the two cannot disagree: you write `awaiting_kind` only with `hold_reason: "kind_not_identified"`.
   - **If a second hold reason ever needs a different question than "what kind is this?", tell cortex first.** Until then, every `awaiting_kind` row asks for the kind.
   - Nothing in your `67d6e9f6` needs to change for cortex.
2. **The row must carry the `leaf_source` key at `awaiting_kind`** (`null` is fine). Without the key, the chip renders nothing, so there are no buttons on the card; the rail line and the header count still show.
   - Your packet puts the leaf keys on every leaf-capable row, and 213 already serves them (Chris saw the chip at `extracting`). So this is a check, not a change.
3. **`leaf_candidates: []` (the TI shape) gives the same card as no list:** PCN and PDN as buttons, with no candidate crop. This is read from the code, not tested: the picker reads `candidates ?? []`, and both shapes take that one path. The afternoon's TI drop is the live test.
4. **The `/leaf` answer replaces the row.** Its `stage` (`received`, as you say) is what takes the drop out of the count. If it answers with the stage still at `awaiting_kind`, the buttons stay until the next poll (2 s) reads the moved row.
5. **No push or event is needed.** The count and the toast read the rows cortex already polls, as you suggest.

## 4. The afternoon check: what Chris sees for a TI drop with no kind picked

1. Drop the PDF and pick no kind. The row goes `received`, then `extracting`. The chip reads `? · not read yet`.
2. **The run ends (about 3.5 minutes). Within about a minute after that, the BFF's 60 s backstop moves the row.** On screen:
   - the rail row is amber, with `Needs you: what kind is this?`;
   - a toast says `Needs you: what kind is this?`, with **Pick**;
   - the header shows `Needs you 1`;
   - the card shows `? · couldn't tell — pick one`, with **PCN** and **PDN** as buttons and no click needed.
3. Click **PCN**. The chip reads `PCN · corrected by <you>`, the buttons go, and the count drops to 0.
4. The relaunch is as last night. The rail first reads `received · attempt 2` for a few minutes while doc-tools' sensor picks the row up. The "re-running as PCN" wording waits for `retry_reason`, after the dry run.
   - Give it **about six minutes** (7f's 300 s sensor floor) to reach `review`.
   - A review card then appears in the timeline.

What a failure looks like:

| what Chris sees | what it means |
|---|---|
| The row is still `extracting` with `? · not read yet` more than about a minute after the run ended | The backstop did not move the row. Either Lane 1's item 1 is failing (the same shape as this morning), or the BFF could not reach Dagster and held the row (it fails closed). Lane 1's logs tell which. |
| `awaiting_kind` on the rail and in the count, but no buttons and no chip on the card | The row carries no `leaf_source` key (§3.2). |
| No toast, but the header count and the amber row are there | The page was reloaded while the row was waiting, or the tab first saw the row already at `awaiting_kind`. Expected, not a failure. |

## 5. The gate

- **Export:** a git-archive of HEAD plus this change, run against producer `938d7639` (CI's `PRODUCER_REF`).
- **Suite:** 3761 of 3761 pass in 247 files; tsc 0; transport 10 sites in 7 files; `build:bundle` builds.
- **Mutants:** 20 of 20 killed, each on its named arm.
  - The first run left two survivors; both were missing arms, not code faults:
    - **The toast's stage check:** no arm moved a row between two other stages. That arm is added (extracting to review).
    - **The amber spine node:** no arm read the node's colour. The rail arm now reads it, with teal as the control.
  - A twentieth mutant removes the header mount. A new Layout test kills it: the control must sit immediately after Tasks.
- **Values diff:** please show Chris the values diff before the roll, as usual. The only cortex change is the `frontend.image` pin, from `a3cf4d1` to `c390a03`.

## 6. GHCR

Run `39815907710` (Build Containers, push) succeeded with 34 steps, none skipped. The image steps ran: `c390a03` is the HEAD of its push.

Read from the GHCR registry API with an empty `DOCKER_CONFIG` (anonymous token, len 76):

| arm | tag | answer |
|---|---|---|
| target | `c390a036d0190176201cb328acfc9a2f0adf8cd1` | 200, `sha256:2359f48e70bfe44fa8f43a709bd6773d007769c81ffb2d56f7921bba96a2f9ce` |
| control, live | `a3cf4d1…` | 200, `sha256:c3a2acdd…` (rev 213, the rollback) |
| control | `9be5963…` | 200, `sha256:46aa6d7d…` (as in the 10-21 packet) |
| negative: short sha | `c390a03` | 404 |
| negative: not the push HEAD | `ea3b3f1…` (full) | 404 |
| negative: fake | `0000…` | 404 |

**Pin the full sha, or the digest.** `ea3b3f1` was pushed in the same push as `c390a03` and has no image: only the HEAD of a push builds.

## 7. Still after the dry run, unchanged

- `allowed_leaves` (7f's §3: the registry has no `label` to serve; that is the architect's to rule);
- the review row's `note`;
- `retry_reason` ("re-running as PCN …");
- the `review_shape` document card;
- the row-edit `evidence_ref`;
- the `PRODUCER_REF` bump.

**7f:** your two leg-B arms are committed as `ea3b3f1`, unchanged. They were green in the gate above.
