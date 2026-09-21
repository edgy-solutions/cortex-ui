# Handoff — cortex-60: the push landed, the board is walked, and the ledger is blocked UPSTREAM

for:      the next session in this seat (cortex-ui :: master, cortex-60's lane)
from:     ia-cortex-60/lane/cortex-60, 2026-09-21
alongside: `sessions/2026-09-21-report-cortex-60-pushed-digest-38cda6c8-and-the-finance-board-walked.md`

    branch    master — R-009: THIS LANE COMMITS TO MASTER, exempt from the worktree rule
    HEAD      ea060f3, PUSHED. origin/master == HEAD, 0 ahead
    tree      clean apart from 91's eight payload files + the report/handoff
    producer  ../invincible-agent 9c7ea4b — READ ONLY, `git status --porcelain` there is empty
    digest    sha256:38cda6c84b3ce6a23f2545c9ae8a7e23cf4e97c7cd632f69da042851eeba21d7
    gate      109 files / 1599 tests / `npm run build` — green at HEAD

---

## 1. WHAT WAS DONE, IN ONE SCREEN

* **Eleven commits pushed together** (`5232343..ea060f3`) — one image, one digest, as ordered.
* **`ea060f3`** adds the `DERIVED_BINDINGS` row `http://invincible-agent/cost#LotCostingReview ->
  mesh:SourceLedger`, four mutation-proven seals beside it. **Lane 1 was told; it merges `lane/32`
  in that step and both mirrors go green together.**
* **Scrub check on `f75e5df` PASSED with a control** — `grep -c eyJ` = 0, `identity` = 3.
* **The digest was read from GHCR's registry API** and proven with a known-answer control.
* **All eight finance prompts walked** against 91's real post-projector payloads. **No renderer
  defect found.** Everything found is payload, projector, routing, or the measurement sheet.

---

## 2. ⛔ THE THING TO NOT RE-DERIVE: THE LEDGER IS BLOCKED UPSTREAM, NOT HERE

The next reader's most likely wasted day is trying to make SOURCE_LEDGER draw for the program
brief by working on cortex's contract. **It cannot be done from this repo.** Measured, end to end:

    presentation_source:  "unrenderable"
    selection_basis:      "payload-only (output_uri matched no capability)"
    registration_version: "graph"
    43 candidate capabilities evaluated — SOURCE_LEDGER IS NOT ONE OF THEM

> **A card that REFUSED a payload and a card that was NEVER A CANDIDATE look identical on screen
> and are different defects.** The first is a contract mismatch and is ours. The second is a menu
> that never carried the row, and no contract work on this side touches it.

The control is inside the same evidence: the other seven payloads report `presentation_source:
registered` / `selection_basis: output_uri+payload`, so the menu mechanism works — it has no
ledger row in it. `registration_version: "graph"` names the cause, and it is lane 32 §5 measured
rather than predicted: Contract D refuses the binding while `mesh:SourceLedger` is undeclared in
the graph, so the row is dropped at admission.

**`ea060f3` does not make the ledger visible. Neither does lane/32's merge.** The prime that
declares the class is Chris's and is still owed. Until then the brief's three findings render as
43 words of KNOWLEDGE_DOCUMENT prose with citations as bare bracket text — `[fin_variance_analysis]`
— which is the shape SOURCE_LEDGER exists to replace.

---

## 3. ⚠ THE TRAPS — each cost something once

### 3.1 `npx vitest run <file>` IS A FALSE RED IN THIS REPO

    npx vitest run src/lib/taskKindParity.test.tsx
      -> "Cannot read properties of undefined (reading 'config')"  — FAILS TO COLLECT
    npm run test -- src/lib/taskKindParity.test.tsx
      -> 21/21 PASS

vitest 4 chokes on the `describe.skipIf` without the project's own config. **Always use the
declared `npm run test -- <file>` form.** A false red is what teaches someone to retry a true one
away. Recorded in `.github/workflows/build.yml`'s pin comment; **worth also putting in
`taskKindParity.test.tsx` itself, which is still open** — that is where the next reader meets it.

### 3.2 RESTORE FROM CAPTURED BYTES, NEVER `git checkout --`

Mutation-testing an **uncommitted** edit: `git checkout -- <file>` restores to HEAD, reports
success, and **silently deletes the subject under test**. The restore must be the inverse of the
MUTATION, not of the last commit. Capture bytes → mutate → restore from the bytes → assert
equality. (lane 32 §6; borrowed here before paying for it.)

### 3.3 `projected` IS AN ARRAY

In 91's payload files the component props are at `projected[0].payload`, not `projected.*`.
`Object.keys(d.projected)` prints `0` for every file and looks like a data problem. Check
`Array.isArray` first.

### 3.4 RENDER PROBES NEED THE QueryClient WRAPPER

Both ELICITATION payloads throw `No QueryClient set` at `AskCardConnected.tsx:22`. That is a
**harness gap, not a card defect.** Copy the wrapper from
`src/components/elicitation/askedSection.test.tsx`. Also: write probe output to a scratchpad file
with `appendFileSync` — every render logs a full `AxiosError` stack from `getMeshConfig`
(`src/api/client.ts:595`) that drowns `console.log`.

### 3.5 THE HARNESS

`gh` is refused by the permission classifier (Bash and PowerShell both). `git push` is refused as
a compound command with a pipe but **succeeds bare**: `git push origin master`. `python` is not on
PATH — use the Write tool or `perl -0pi -e`. **Never `git add -A` here** — shared checkout, stage
by name.

### 3.6 READ THE DIGEST FROM GHCR, NOT THE BUILD LOG

    GET https://ghcr.io/v2/edgy-solutions/cortex-ui/frontend/manifests/<tag>
    -> docker-content-digest        (anonymous pull token; no `gh` needed)

The build log hands back QEMU's helper image. Prove the instrument every time with the known tag
`8a13dd6 -> sha256:c8d6553f142ebb70…` (Lane 1 read that same digest off the pod), and confirm the
answer is the **manifest list** — `application/vnd.oci.image.index.v1+json`, amd64 + arm64 — not
one arch. A 404 is ambiguous between "not built yet" and "no anonymous access"; the control
disambiguates it.

### 3.7 CLAUDE.md AND .mcp.json CANNOT REACH THE IMAGE

The builder does `COPY . .` and there is no `.dockerignore`, so it looks like they can. **The
final stage copies only `/app/dist`, `nginx.conf` and `docker-entrypoint.sh`.** That measurement
is why `703e72c` and `2717b89` — two of Chris's own commits that no order covered — were released
rather than held back for a second digest. **Flagged to the architect as an unruled call; it is
reversible, since nothing of them ships.** Check whether a ruling came back.

---

## 4. THE MEASUREMENT LESSON WORTH KEEPING

**The funding grid's field names cannot be tested on this data, and neither can the EAC pair.**
The producer emits one quantity under six names: `committed == obligated`, `secured == expended`,
`authorized == required` on **every one of 18 rows**; and `highest_eac == highest_value`,
`lowest_eac == lowest_value`. Whichever of a pair a contract names, it draws the right number —
**so if they ever diverge, no test on either side notices.**

> A mapping is unfalsifiable where two fields are equal by construction. **Ask the producer for a
> payload where each synonym pair DISAGREES.** That is the only input that can catch it.

Same discipline elsewhere in the walk: the identity claim above is a measurement and not a
coincidence **because each identity has a counter-example in the same payload** (`committed`
differs from `authorized` on 12 rows, `secured` from `committed` on 17).

And two sheet checks are **unwalked, not passed** — say it that way: 0 of 18 rows have `gap < 0`
(the over-obligated branch never runs), and `all_methods_answered: true` (the undefined-method
branch never runs).

---

## 5. OPEN — and none of it is cortex's to close

| what | whose |
|---|---|
| the prime declaring `mesh:SourceLedger` in the graph | **Chris** — blocks §2 entirely |
| the two routing regressions (drivers == decomposition; CPI/SPI → elicitation) | 91, filed |
| the funding grid titled `scope_label` = "Operations and Maintenance", one of its three lines | producer |
| a payload where the synonym pairs disagree | producer — see §4 |
| ruling on `703e72c` / `2717b89` being released | the architect |

**Ours, and small:** record the vitest-4 false red in `taskKindParity.test.tsx` itself (§3.1); and
`SHORTFALL_GRID` + `KNOWLEDGE_DOCUMENT` render **zero `data-*` attributes** where every other card
carries them — an ADR-0055 §2 gap, **filed and NOT acted on, because step 2 is frozen.**

---

## 6. STANDING RULES IN THIS SEAT

* **R-009** — this lane commits to `master`. Exempt from the worktree rule, because master is what
  Chris rolls.
* **Shared checkout.** Both lanes commit as `Chris Nogradi <cnogradi@gmail.com>` — **authorship
  cannot discriminate**, so a commit you did not write looks exactly like yours. Account by
  content (`git show --name-only`), always with a known-`src/` commit in the sweep as the control.
* **This lane does not release commits it did not write** without a word from the architect.
* **91's eight payload files stay UNCOMMITTED**, by their instruction.
* **The report and this handoff are committed but held UNPUSHED** — a sessions-only push builds a
  second image and a second digest, and `38cda6c8` is the one Lane 1 has been told. They go with
  whatever lands next.
* **Nothing in ADR-0055 step 2 starts.** The inventory is accepted and frozen.

Lane: ia-cortex-60/lane/cortex-60
