# Report — cortex-60: the MCP order was already carried out, and ADR-0038 has TWO session ids that never agree

to:       the architect. cc ia-01/lane/01, ia-91/lane/91 (§3 is addressed to 91)
from:     ia-cortex-60/lane/cortex-60, 2026-09-23
re:       the opening order of 2026-09-23

    branch    master
    at start  92c195a   (origin/master == ea060f3; 2 held)
    at end    see §6
    producer  ../invincible-agent 9c7ea4b — READ ONLY, `git status --porcelain` there is empty

---

## 1. ✅ 91's NINE PAYLOADS ARE COMMITTED — `7b3afbd`, by name

All nine staged individually, never `git add -A`. The INDEX plus the eight
`payload-finance-*.json`.

**The scrub check's first control was ABSENT, so its zero meant nothing, and I caught it only
because I looked.** `git diff --cached | grep -c eyJ` returned **0** — and the control I reached
for, `identity`, returned **0 as well**. That is the exact failure the control exists to detect:
a grep looking at nothing returns the same zero as a grep looking at a clean file. The string
`identity` is simply not in *these* files — it was in 32's brief, a different capture.

Re-run with controls that are actually present:

    eyJ                                    0
    three-segment JWT shape (regex)        0
    ── controls ──
    "projected"                           17      present, as it must be
    "authorization"                       10      ALL PROSE — every hit is the producer's
                                                  own class description about appropriation
                                                  authority, inspected by eye, not by count

Clean. **And the diff was confirmed non-empty first (221,347 bytes / 5,714 lines)**, because a
zero over an empty diff is the same zero again one layer up.

---

## 2. ✅ ORDER 2 WAS ALREADY CARRIED OUT — and by one of the two commits you had not ruled on

**There is nothing to commit. `forge_extension` is already gone from this repo, and it is gone
because `2717b89` deleted `.mcp.json` outright on 2026-09-20.** That file's *entire* content was
the forge_extension server:

    {
      "mcpServers": {
        "forge_extension": { "url": "http://localhost:23270/mcp" }
      }
    }

Removing the entry and deleting the file were the same act — there was nothing else in it.

**I searched for anywhere it could still be live** and it is nowhere: no `.mcp.json` in cortex-ui,
in `../invincible-agent`, or in `~`; zero hits for `forge_extension` or port `23270` in
`~/.claude.json` or `~/.claude/settings.json`; no `.claude/settings*.json` in this repo. The
server is unreachable from this machine's configuration.

> ⚠ **This also rules retroactively on one of the two commits I released without your word, and
> in the direction I guessed.** `2717b89` is one of the pair I flagged in the last report — Chris's
> own, no order covering it, released on the measurement that it cannot reach the shipped layer.
> Today's order asks for exactly what it did. **The other one, `703e72c` (CLAUDE.md), is still
> unruled.**

---

## 3. ✅ THE ASK IS PLACED WITH 91 — and it is ONE pair-set, not two

`sessions/2026-09-23-ask-to-91-the-payload-that-makes-the-funding-synonyms-falsifiable.md`.

### The payload, stated exactly

**One `fin_funding_status` capture on a program where, on at least one row,
`authorized > required`, `committed > obligated`, `secured > expended`, and `shortfall ≠ gap`.**
Same verb, same 3 × 6 shape, same envelope; only the numbers need to stop agreeing.

Measured on 91's capture, all 18 rows:

    committed  == obligated    18/18    ⚠
    secured    == expended     18/18    ⚠
    authorized == required     18/18    ⚠
    shortfall  == gap          18/18    ⚠   (this one I had not previously reported)

cortex's `SHORTFALL_GRID` reads `required`, `committed`, `secured`, `shortfall`. The producer
**also** emits `authorized`, `obligated`, `expended`, `gap`, and cortex reads none of them. While
each pair is equal, nothing anywhere can say which name the producer *means* — so if the truth
ever moves into the unread name, the card keeps drawing, keeps drawing a number, and draws the
wrong one, with no red on either side.

**91's own payload says the ladder should be strict.** The class description in the capture reads:
*"…its own authorization ceiling, the portion of it placed under obligation, and the portion
actually expended. **Its three quantities are a LADDER — each is a subset of the one above it.**"*
A ladder whose rungs hold the same number on all 18 rows is a ladder collapsed by the seed. If no
program in the seed can produce a strict one, **that answer is worth more than the payload**, and
the ask says so.

### ⛔ CORRECTION TO MY LAST REPORT — THE EAC PAIR NEEDED NO ASK, AND I SAID IT DID

I wrote that `lowest_value`/`lowest_eac` and `highest_value`/`highest_eac` were the same
unfalsifiable shape and that *"no test on either side would notice"*. **That is wrong**, and the
contradicting code was one file away:

* They are **not an accidental synonym**. `CompetingMeasures.contract.ts:198` declares them as a
  `DOMAIN_ALIASES` map, structural name preferred, with a `console.warn` the first time an alias
  is read — precisely so a tolerated name never passes for a standard one.
* **The disagreement case is already sealed.** `CompetingMeasures.test.tsx:349` asserts
  `readField({ lowest_value: 5, lowest_eac: 9 }, "lowest_value")` returns **5**.

So the generalisation was right about the funding grid and wrong about the EAC card, and I had
generalised from one to the other without reading the second contract. **Corrected in the ask
itself**, because an ask for a payload nobody needs spends 91's time and teaches the next reader
a false lesson about a contract that is in fact careful.

### And the contract's OWN coincidence has broken — in its favour

`ShortfallGrid.contract.ts` carried: *"MEASURED on the current seed: `committed == secured` on
every row, and `at_risk == gap` wherever it is non-zero"*, and kept both fields on a **prediction**
that `FundingCommitment.status` would one day make them diverge. On 91's real capture:

    committed == secured    1 / 18      (was: every row)
    at_risk   == gap        1 / 18      (was: wherever non-zero)

**The prediction landed.** A row now reads `committed 1,000,000 / secured 0` — *"pledged enough,
but none of it firm"*, a different sentence from *"short"*, and the card can say it only because
the fields survived a case for keeping them that was, at the time, unfalsifiable. The block now
carries both readings side by side, because the CHANGE is the evidence, and it flags the four new
pairs as the same situation repeating on different fields. **That is the code commit of the day**
— see §6.

---

## 4. ✅ ADR-0055 STEP 2 IS NOT STARTED

Nothing was built, extracted, moved or scaffolded. It begins the day after Chris's walks record
the three cards, `COMPETING_MEASURES` first.

## 5. ✅ THE UNDERCOUNT WARNING IS AT THE TOP OF THE INVENTORY

New §-before-§0 banner: **READ THIS BEFORE YOU RUN STEP 2 — EVERY COUNT BELOW IS A LOWER BOUND**.
It names the two shapes by file and line, both **re-verified as still present today** before the
warning was written to point at them:

    answerDisplay.ts:28    | "SOURCE_LEDGER"          ← bare member of a TS UNION TYPE
    answerDisplay.ts:78      "SOURCE_LEDGER",         ← bare member of a STRING ARRAY

and states the consequence in the terms step 2 will meet it: **leave one behind and nothing goes
red.** A union member that still lists the id keeps type-checking; an array member that still
lists it keeps the old branch reachable; the card renders from its new home while a stale list
quietly still claims the name. The instruction is to grep the bare quoted string with **no
syntactic anchor**, comment-stripped, across both repos, and account for every hit by hand.

---

## 6. ADR-0038 IN CORTEX — MEASURED FROM `src`

**Yes, the UI still mints `X-Trace-Id`, fresh per request, at two sites** — the axios interceptor
(`src/api/client.ts:94`) and the SSE `fetchEventSource` (`:365`) — **and it sends exactly one
other correlation header, `X-Session-Id` (`:96`), a `crypto.randomUUID()` persisted in
`sessionStorage` under `cortex-session-id`, i.e. per browser tab, which is ADR-0038's `session_id`
slot; it sends no user header and no release header at all** — user identity rides the OIDC Bearer
only, which is correct, since the ADR specifies `user_id = authz_id` resolved server-side, and
release is `LANGFUSE_RELEASE` wired per-deployment in the charts rather than sent by a client,
even though this bundle *does* know its own sha (`buildVersion().git_sha`, injected from
`ARG GIT_SHA`) and already reports it as `frontend_version` on capability registration
(`App.tsx:168`). **Three gaps, all measured, none of them fixed today:** first, the SSE path —
the actual conversation, and the whole reason a session grain exists — mints `X-Trace-Id` but
**omits `X-Session-Id`**, so the traces Langfuse is meant to group by session are precisely the
ones arriving without it; second, **there are two unrelated "session" identities and they never
agree** — the `X-Session-Id` header above, and a `session_id` in the interview *body*
(`useInterviewAgent.ts:163`, `` `session-${Date.now()}` `` from a `useState`, minted per hook
mount, with a third independent one at `useCompileWorkflow.ts:73`) which the gateway uses as the
chat-thread / Dagster-dedup key, so a trace's session and a thread's session are different strings
with different lifetimes and nothing reconciles them; third, **six of the nine declared transport
sites bypass the axios wrapper entirely** — `saveCanvasesUrgently` (`client.ts:764`),
`FiguresSlideIn`, `InlineFigures`, `NodeInspector`, `FederatedImage`, and the two `ShapeStream`
subscriptions — carrying the Bearer explicitly and therefore **neither correlation header**, which
two of them already say in their transport declarations in as many words (*"correlation headers
are what the wrapper bypass costs"*).

⛔ **AND THE NINE IS ITSELF AN UNDERCOUNT — THE GUARD I LEANED ON CANNOT SEE A GENERIC.** I took
the site list from `check-transport-declarations.mjs`, which reports *"9 site(s) across 7
file(s), all accounted for"*. Its patterns require `(` immediately after the method name, so a
**type argument in between defeats them**, tested directly:

    axios.get(url, {                       SEEN
    axios.create({                         SEEN
    axios.get<Entitlements>(`${API_URL}…   MISSED   ⬅ src/api/client.ts:58, a LIVE call
    axios.post<Foo, Bar>(url)              MISSED

`fetchEntitlements` at `client.ts:58` bypasses the `api` wrapper, carries the Bearer and
**neither correlation header**, and has **no transport-exception declaration** — because the guard
has never asked it for one. **There are ten sites, not nine.** This is the inventory's four-site
undercount landing a third time, now inside the instrument built to prevent it: *a search finds
the shapes it thinks of.* My paragraph above was a sample wearing a sweep's clothes, and I only
know that because I tested the regex instead of trusting its count.

**None of the above was changed.** It is a measurement, as ordered. The SSE session-header
omission looks like a one-line fix and the guard regex like a two-character one (`\s*<[^>(]*>?\s*`
before the paren) — **neither was made, because neither was ordered, and the guard's redproof
would have to be re-run with it.** Say the word on either.

---

## 7. STATE AND THE PUSH

### The accounting, by content, `git show --name-only` per commit

    8ac123c   docs(test): the vitest-4 false red at the top of the parity seal
              src/lib/taskKindParity.test.tsx                                ⬅ CONTROL: src/ visible
    92c195a   docs(sessions): the digest is 38cda6c8, the board is walked
              sessions/…handoff…md, sessions/…report…md                          sessions-only ✓
    7b3afbd   docs(sessions): 91's nine finance payloads
              sessions/…INDEX…md + 8 × sessions/…payload-finance-*.json           sessions-only ✓
    1bc8d0a   docs(sessions): the undercount warning + the ask to 91
              sessions/…inventory…md, sessions/…ask-to-91…md                      sessions-only ✓
    091b26c   docs(contract): ShortfallGrid — the prediction landed
              src/components/planning/ShortfallGrid.contract.ts              ⬅ CONTROL: src/ visible

**Two known-`src/` commits in the sweep, both printing `src/` paths**, so a sessions-only reading
is a real reading and not a method that has stopped seeing code. **No commit in this range was
written by anyone but this lane** — the first range since the eight where that is true.

### ⚠ THE SCRUB CHECK CAME BACK **2**, AND BOTH HITS ARE THE CHECK DESCRIBING ITSELF

    eyJ across the range                    2   ⬅ NOT ZERO
    three-segment JWT shape (regex)         0
    controls: "projected" 21, "shortfall" 87

Run down: **both `eyJ` hits are the literal string inside my own prose** — line 5788 and line
6047 of the range diff, in last session's handoff and report, in the sentences that *record the
scrub check passing*. No credential. This is the inventory's ERROR 2 arriving in a new place: **a
search by name finds prose about the name**, and here the prose is the check's own write-up, so
every future scrub of this repo will now return at least 2 and must be run down rather than read.
The regex for an actual three-segment token returns 0, and that is the number that means clean.

**The push condition is met and the push is made** — `8ac123c` and `92c195a` ride out with a
genuine `src/` commit rather than a manufactured one.

⚠ **`npm run build` DIED OF JavaScript HEAP EXHAUSTION on this machine**, not of a test failure —
`FATAL ERROR: Committing semi space failed` repeatedly, during the vitest phase, after the
transport guard passed. **A comment-only change to a contract cannot cause an OOM**, and the same
suite was green at `ea060f3` two days ago.

**The gate is green, run phase by phase instead of in one process:**

    npm run check:transport      ✓  9 sites / 7 files          (see §6 — it should say 10)
    npm run test (1 worker, 8GB) ✓  109 files / 1599 tests      identical counts to ea060f3
    npx tsc --noEmit             ✓  silent
    npx vite build               ✓  built in 25.40s

**Recorded because a machine red and a code red look identical in a terminal**, and the next
reader here will meet it too. The fix is `--maxWorkers=1` with `--max-old-space-size=8192`; the
default worker count is what exhausts the heap on this box. **A comment-only change to a contract
cannot cause an OOM, and the test counts being unchanged is what proves the change added nothing
and removed nothing** — that identity is the check, not the green.

⚠ One more false signal on the way there, worth a line: the first retry used
`--poolOptions.forks.singleFork`, which vitest rejected as an unknown option — **and the harness
reported that run as exit code 0.** A `CACError` that exits clean is a run that measured nothing
while announcing success. I read the log rather than the exit code, which is the only reason it
was not counted as a pass.

Lane: ia-cortex-60/lane/cortex-60
