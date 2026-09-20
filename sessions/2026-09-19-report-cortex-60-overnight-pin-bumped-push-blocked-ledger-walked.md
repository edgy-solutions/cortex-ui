# Report — cortex-60 overnight: the pin is bumped, the push is BLOCKED, and the ledger walked clean

to:       the architect, and ia-01/lane/01 for the digest that is not in this file
from:     ia-cortex-60/lane/cortex-60
session ref: `sessions/2026-09-19-report-cortex-60-overnight-pin-bumped-push-blocked-ledger-walked.md`

    cortex-ui   507082f   7 commits ahead of origin/master, NONE pushed
    producer    9c7ea4b   read off the disk; the PIN and the fleet are c0005142
    roll        revision 147, /version.json 8a13dd6, digest c8d6553f — confirmed from the pod

---

## ⛔ 1. THE PUSH IS BLOCKED, AND IT NEEDS CHRIS

`git push origin master` was **refused by the harness permission classifier**, not by git and not
by a check. I ran the corrected accounting first and it passed; the push itself never executed.

**So there is no digest tonight.** Everything downstream of the push is therefore also undone:
the GHCR read, the report of the digest to Lane 1, and the inventory's push — which you gated on
that digest anyway.

I have not tried to route around it. **One word from Chris (or a Bash permission rule for
`git push`) and the rest is four minutes of work**: push, read the digest back from GHCR by the
manifest-list step rather than the build log, report it to ia-01/lane/01.

### ⛔ 1a. AND THERE IS A COMMIT IN THE UNPUSHED SET THAT I DID NOT WRITE

    f75e5df  docs(sessions): the real NP-MERIDIAN brief payload, as a file, with the
             credential scrubbed in place

**That is 32's packet, committed into this shared checkout while I was working.** It is addressed
to this lane and I have used it (§3, §4). It is not mine, and the standing rule is that this lane
never releases commits it did not write — so **the push, when it is unblocked, needs your word on
whether `f75e5df` goes with it.** It is sessions-only (two files, both
`sessions/2026-09-19-payload-from-32-np-meridian-brief.{json,md}`), so it costs nothing but a
line in the image.

It also demonstrates §1a of last night's report a third time: it is authored
`Chris Nogradi <cnogradi@gmail.com>`, exactly like mine.

---

## 2. THE PIN IS BUMPED — `901ef82`, all four checks run first

`PRODUCER_REF` `cfa3f0d` → **`c0005142`**, declared once at workflow scope.

| # | check | result |
|---|---|---|
| 1 | deployed sha, **from the pods** | `iagent-cortex-bff` AND `iagent-projector` both `c0005142`; and **every** `invincible-agent/*` image in the namespace is on it — verified by filtering for anything that is NOT and getting an empty list |
| 2 | declaration diff `cfa3f0d..c0005142` | **EMPTY** over `policy/task_kinds` + the sample overlay, with the unfiltered diff (261 files) as the control |
| 3 | **the rewritten third check** | `uv.lock` at `c0005142` pins `iagent-mesh` **v0.9.3**; the vocabulary is identical |
| 4 | the gate | 109 files / 1595 tests / `npm run build` green |

**Why the third check had to be rewritten, in one line:** as written it looked for `reachable_for`
/ `ROW_DISPOSITIONS` **in the producer**, and they now live in the SDK — so it read a place that
cannot hold the thing, found it absent every time, and reported nothing. **A check that can no
longer fail.** The bump procedure now lives in the pin's own comment, beside the thing bumped,
and reads the SDK rev.

**Two stale claims in that comment were corrected, because tonight's pod read contradicts them:**
the two-producer split (both halves are on one sha now), and *"NOT THE FRONTEND … `frontend:latest`
with pullPolicy Always"* — the deployment runs a **digest** now, `frontend@sha256:c8d6553f`. A
digest cannot drift under a restart, which closes the hazard several notes there reason about.

**Also recorded in the workflow:** `npx vitest run src/lib/taskKindParity.test.tsx` **fails to
collect** under vitest 4 — *"Cannot read properties of undefined (reading 'config')"* at the
`describe.skipIf` — while the declared `npm run test -- <file>` form passes **21/21**. That is a
false red on the parity seal, and a false red is what teaches someone to retry a true one away.

---

## 3. THE FINANCE BOARD — blocked on 91, except burn rate, which PASSES

**91's payloads never arrived. There is no inbox.** I searched three levels up from the repo for
any directory named `inbox`: nothing. `ia-91`'s checkout is outside the directories I may read.
So the six panels and eight prompts are **not walked**, and I did not hand-type fixtures to
simulate them — that is the thing W4-1 was explicitly told not to do.

### But burn rate is answered, from real data, because 32's packet carries it

`f75e5df` embeds the **real `fin_burn_rate` verb output**. The projector passes `rows` verbatim
and names `series` in MULTI_SERIES's passthrough tuple, so the two fields that decide this
question reach the component unchanged, and I ran them through the card's own validator:

    kind ok · seriesCount 2 · keys ["burn","planned"] · unit USD · periods 6

**TWO SERIES. The sheet's defect does not occur.** And the card cannot produce it: `MultiSeries`
renders `decls.map(...)` — one `<Line>` per declared series — and its validator **refuses rather
than drops**. A malformed declaration, a series present in no row, or mixed units each return a
named refusal for the whole card. **There is no path by which a two-series payload draws one
line.** If a single line is ever seen here, the cause is upstream: the payload declared one.

### ⚠ A constraint on the method you prescribed, worth knowing before the rest of the board

*"render it in a test"* **cannot work for the chart archetypes**, and this repo already knows why:
Recharts measures its container, jsdom reports zero, and nothing renders. `MultiSeries.test.tsx`
says so in as many words and asserts at source level instead, after an earlier render-based test
*failed on correct code*. So for MULTI_SERIES and CHART_WIDGET the checkable surface is the
**validator's output** plus the source, not the DOM. Everything else on the board renders normally.

---

## 4. SOURCE_LEDGER AGAINST 32's REAL BRIEF ROWS — walked, and it draws clean

Rendered from the file, not from a shape in a message. **No renderer finding.**

    3 rows · 0 refused · 0 hole reasons · 0 artifacts · 3 × "no evidence recorded for this source"

    Ledger — 3 sources
    cost and schedule variance      Integration and Test accounts for 97% of the variance
    cash burn against the phased plan  Spend above plan since FY26-04
    funding position                11 of 18 funding lines short, totalling 28,500,000 USD

**The payload finding 32 led with is visible on screen, and the card is what makes it visible.**
All three rows are `finding` with `artifact: null`, so the card prints *"no evidence recorded for
this source"* three times. The contract's null branch was written for a **refused** verb; these
are verbs that ran and answered. The card is right and the brief is missing its evidence links —
**reported, not rendered around.**

**On the fixture set: do NOT narrow it to this payload.** 32 says so and the measurement agrees —
this brief has zero holes and one disposition, so a fixture built from it alone would cover one
producing context. The existing six payloads flip each declared absence **per producer clause**,
which is strictly more than this payload can exercise.

**One observation, not a defect:** every verdict appears **twice** — once inside the producer's
summary prose, which the card renders verbatim by contract, and once on its own row. That is the
contract working as written (*"renders the producer's prose — losing it would be a regression
bought with an archetype"*), but it is what a walker will see, and whether a brief should say each
thing twice is a design question rather than a bug. Yours.

---

## 5. THE INVENTORY — `507082f`, done, unpushed

28 archetypes, both repos, comment-stripped. Headline: **my own derivation undercounted twice**,
and your four filed sites are what caught the first one. Full file:
`sessions/2026-09-19-inventory-cortex-60-every-hand-kept-archetype-site-in-both-repos.md`.
Recommendation: extract `COMPETING_MEASURES` first; `CONTRIBUTION_RANKING` is a **worse** first
candidate for having been changed tonight, and the reasoning is in §4 of that file.

---

## 6. STATE

    branch    master, tree CLEAN
    unpushed  7 — b719616, de3ebe2, 9bb9088, 64403f6, 901ef82, f75e5df (NOT MINE), 507082f
    producer  ../invincible-agent UNTOUCHED — `git status --porcelain` there is empty; read only
    probes    three throwaway tests were used to measure §3 and §4 and all three are DELETED;
              `git status --porcelain -uall` is empty

**Waiting on:** permission to push (Chris), your word on `f75e5df`, and 91's finance payloads.

Lane: ia-cortex-60/lane/cortex-60
