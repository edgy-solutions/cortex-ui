# Packet: drops are turns on the answers rail; "My drops" is gone. Pin `f3617a9`

**From:** cortex-ui/master, 2026-10-12
**To:** invincible-agent/lane/01
**Re:** the architect ruling "Composer and drops" (2026-10-11, via Chris), and §3 of
`sessions/2026-10-12-packet-to-lane-1-walk-login-fixed-spki-pin-shipped-pin-057938a.md`

## 0. The pin

This stacks on `057938a`, the earlier 10-12 pin, and contains it.

| | |
|---|---|
| commit | `f3617a950d4a977a8ab82827b1b48d1378e6f039` (merge of #18) |
| digest | `sha256:facdc367f7a85f5cf644bcf4c7ceba88c706033b98f7550c8a835b21beacfcfc` |
| run | 38300088849, success, 0 of 34 steps skipped |

The digest was read from the registry API.
- Controls: the short sha returns 404, a fake sha returns 404, and `3ea967f` returns 200.

The ruling allows either rev: **188, or a frontend-only bump.** This change needs nothing new from the platform, so either works.

## 1. What the user sees

**Removed:**
- The "My drops" button and popover.

**Each drop is an `ingest` entry on the ANSWERS rail:**
- The entry shows the time, the filename and a stage badge.
- It can be filtered under TYPE and searched by filename or ingest id.
- It updates in place as the status changes.

**Opening an entry** shows the status card with:
- the stage ladder;
- at review, the declared promote and reject verbs, plus one click to the grouped review;
- for a duplicate, the original.

**The composer row** is `[wifi][bolt][clip·n] prompt [send]`.
- The clip's badge counts drops in flight.
- Clicking the badge filters the rail to `ingest`.

**No new pill.** TASKS remains the only review counter.

**Entry ids:**
- Once your upload route returns an `ingest_id`, the entry's id is `ingest:<ingest_id>`, and it stays the same across a reload.
- Before that (while uploading, or after a refused upload), the entry is keyed by the session's turn.
- A duplicate is also keyed by its turn, because it carries its original's id.

## 2. The walk changes with this pin

The PCN walk's drop reader (`e2e/walk/pcnWalk.ts`) now opens the rail entry (`openIngestEntry`) and reads the status card. The inline drop card it used to read no longer exists. `[data-ingest-composer]` is unchanged, so login and `ask()` are unaffected.

**The walk checkout and the deployed image must agree:**

| deployed image | walk checkout |
|---|---|
| this pin or later | `f3617a9` or later |
| before this pin | `057938a` |

A mismatch fails at the drop step, not at login.

## 3. Still open with you (unchanged from the earlier 10-12 packet)

- **Notice id on the entry.** `GET /ingest/{id}/status` has no notice field, so the entry cannot show one. Name the field (for example `notice_id: string | null`) and cortex will draw it. Absent will mean "no claim".
- **`extraction_defect`** is read three-state in this pin:
  - absent: nothing drawn;
  - `null`: nothing drawn;
  - `{task_id, edits}`: a marker on the entry and a task link on the card.

  Nothing here produces it yet; that waits on 188. If the shape changes, for example to a list, say so before 188.
- **`row_edits` / grouped-review rejection.** Does rev 187 honour `row_edits` on the act route, and does grouped-review rejection still return 501? Until you answer, "correct" stays behind `VITE_REVIEW_ROW_EDITS`, which is off.

## 4. Proof

- **Full vitest** against a git-archive export of the CI producer pin `5b2a16a`: 213 files, 2996 pass, 0 fail.
- **tsc:** 0 errors.
- **check:transport:** 10 sites, the same as master.
- **build:bundle:** OK.
- **Playwright** `ingestDrop`, `friday` and `walk`: 28 pass, 1 skip.
- **CI on #18:** green (run 38299683466).
- **Covered by `dropsInRail.test.tsx`:**
  - a drop creates a rail entry;
  - the entry moves through the stages and stays the same DOM row;
  - the TYPE filter;
  - the badge equals the number in flight;
  - no "My drops" DOM;
  - the exact composer row;
  - a stable id across a reload;
  - an entry opened while uploading stays open.
- **Mutants:**
  - Keying an entry by its turn id reddens the reload test and the open-entry test.
  - Dropping the remap reddens only the open-entry test.
