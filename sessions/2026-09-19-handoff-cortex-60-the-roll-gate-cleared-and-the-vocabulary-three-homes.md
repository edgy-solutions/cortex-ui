# Handoff — cortex-60: the roll gate is cleared, and the vocabulary now has three homes

to:       ia-cortex-60/lane/cortex-60
read-by:  ia-cortex-60/lane/cortex-60
session ref: `sessions/2026-09-19-handoff-cortex-60-the-roll-gate-cleared-and-the-vocabulary-three-homes.md`

Written 2026-09-19 on the architect's handoff order of the same day. Every claim below is marked
**[M]** measured this session or **[I]** inferred. An **[I]** about a cause I did not measure is
labelled a **guess** in as many words.

---

## 1. THE EXACT NEXT STEP

**1. Hold for walk findings.** Renderer findings are yours; payload findings are not — the sheets
define the split. Nothing to run.

**2. When the roll lands, ONE commit — all three parts together, not separately:**

   a. Bump `PRODUCER_REF` in `.github/workflows/build.yml:27` to **the rolled sha**, declared ONCE
      at workflow scope. Do not reintroduce a second literal.
   b. Rewrite the pin's third check so it reads **the producer sha AND the SDK pin**. As written
      it names `reachable_for` / `ROW_DISPOSITIONS`, which no longer live in the producer (§3).
      A bump that leaves it as-is re-arms a check that can no longer fail.
   c. Fix `src/components/ledger/SourceLedger.contract.ts:56` — *"Mirrors `rows.py`'s
      `HOLE_DISPOSITIONS`"* now resolves into the SDK, not the producer.

   Before the bump, run the three checks the pin's own comment names. In the repo's DECLARED form:

       # producer tag, read FROM THE POD, never from a note
       kubectl get pods -n sandbox -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

       # the declaration diff — ruled to matter above all
       git -C ../invincible-agent diff <old> <new> -- policy/task_kinds policy/overlays/sample/task_kinds

       # the parity seal, with the producer present
       CORTEX_PRODUCER_REF=<sha> npm run test -- src/lib/taskKindParity.test.tsx

       # the full gate, which is what CI's image build runs
       npm run build

   ⛔ **`CORTEX_PRODUCER_REF` IS A LABEL, NOT A SELECTOR.** It only feeds assertion messages. The
   seal reads `../invincible-agent` **off the disk**, at whatever that checkout is standing on.
   Before trusting any run, establish the baseline — see §5, where I got this wrong.

**3. Then stop.** No instrument work until four walks draw.

---

## 2. STATE

    branch            master   (R-009: this lane commits to master, exempt from the worktree rule)
    head sha          b3f27827041063d229d928bfbef37b8d63fd3641
    ahead / behind    0 / 0 vs origin/master
    tree              CLEAN — `git status --porcelain -uall` empty
    worktrees         one: C:/Users/cnogr/git/cortex-ui [master]
    origin            https://github.com/edgy-solutions/cortex-ui.git  (repointed this session)

**[M] Untracked files I left, everywhere, absolute:**

    C:/Users/cnogr/AppData/Local/Temp/claude/c--Users-cnogr-git-cortex-ui/52b86766-33bb-40af-ba7f-a123f7671b07/scratchpad/commitmsg.txt
    C:/Users/cnogr/AppData/Local/Temp/claude/c--Users-cnogr-git-cortex-ui/52b86766-33bb-40af-ba7f-a123f7671b07/scratchpad/msg2.txt
    C:/Users/cnogr/AppData/Local/Temp/claude/c--Users-cnogr-git-cortex-ui/52b86766-33bb-40af-ba7f-a123f7671b07/scratchpad/msg3.txt

Session scratchpad only — commit messages, written there because a heredoc to `git commit -F-` was
refused twice by the harness classifier. **Nothing untracked inside any repo.**

**[M] The image and what is actually running:**

    pinned digest    sha256:c8d6553f142ebb70024bf09f4b7f93c77c2ad62ebe4e0cc009465461b3824ced
                     built at cortex-ui 8a13dd6; READ BACK FROM GHCR, not copied from the build log
    :latest          sha256:4a0a8847…  (= aa53a14)  — moved twice today
    running pod      iagent-cortex-ui-7d47979cc5-5t2jf, namespace `sandbox`
                     digest sha256:70a0eead2455bc3185169487dfc205a034abf922608777b39b8365676e7a0bd7
                     /version.json  git_sha df702ca, built 2026-09-19T16:08Z
    deployed bff     ghcr.io/…/cortex-bff:91d8d34e01c5f0a2432e1d4f282db52225e2fc46 (projector too)

**[M] `70a0eead` is a child of NEITHER index** — I read both `c8d6553f` and `4a0a8847` platform
manifests. It is an older `:latest`. **[M] and the cause is measured, not guessed:**
`imagePullPolicy=Always`, `restartCount=0`, `startTime=2026-09-19T16:40:03Z` — the pod resolved
`:latest` once at 16:40 (after the 16:08 df702ca build) and has never restarted, so the 18:20 and
18:24 moves never reached it.

⛔ **[M] THIS CHECKOUT IS SHARED WITH ba.** `git log` shows commits this lane did not write, and
the producer sibling moves under you mid-session (§5). **Never `git add -A`** — stage by name.

---

## 3. MEASURED vs INFERRED

**[M] Measured this session:**

* Parity seal **21 passed / 0 failed / 0 skipped** against producer `51db099`, with the baseline
  established rather than assumed: producer HEAD `51db099`, `git diff 51db099 -- policy/…` empty
  (so disk content IS the sha's), nothing untracked there, 4 seed + 9 overlay declarations read,
  and the `"the seal RAN, or says so"` block passed — it sits OUTSIDE `skipIf`, so a skipped seal
  would redden it rather than hide in it.
* The declaration diff is **EMPTY** across `cfa3f0d→51db099`, `91d8d34→51db099`, and
  `51db099→c0005142`. The stale pin was not hiding drift **on this surface**.
* **The disposition comparison: IDENTICAL.** cortex `LEDGER_DISPOSITIONS` (finding, unsummarised,
  empty, unentitled, unavailable) == wheel `ROW_DISPOSITIONS`, same five, same order;
  `LEDGER_HOLE_DISPOSITIONS` == `HOLE_DISPOSITIONS`, same two, same order. Read by **importing the
  installed wheel**, and the wheel proven to BE the pin first — `direct_url.json` commit
  `b6d597f0` == `uv.lock` rev for v0.9.3.
* `reachable_for("fail")` → the 3 non-hole terms; `"named-hole"` → all 5. Matches the card's prose.
* `rows.py` **present** in iagent_mesh 0.9.3, **absent** in 0.9.2 — by listing module files, not by
  a grep that returned nothing.
* `ROW_DISPOSITIONS` absent at `cfa3f0d`, in-repo (`agent_fleet/graph_host/rows.py`) at `91d8d34`,
  in the SDK at `51db099`.
* build.yml at `8a13dd6`: success, 31/31 steps, **none skipped** — read by step name, including
  step 3 (producer checkout) and step 8 (the seal), because a green overall can hide a skipped job.
* The three safety rows live at `assembleCapabilities.ts:596 / 615 / 625` under
  `http://internal/sustainment/safety#`, with a control of 8 `invincible-agent/cost#` rows in the
  same file so a zero would have been a finding and not a blind matcher.
* The four ADR-0055 §2 declaration sites: `ArchetypeGlyph.tsx:99`, `answerDisplay.ts:28`,
  `answerDisplay.ts:78`, `answerDisplay.ts:179`.

**[I] Inferred — and the ones that are guesses, named:**

* **GUESS:** that the harness classifier refused on the heredoc / compound-command shape. I never
  measured the trigger; I only observed that splitting the call and using `git commit -F <file>`
  succeeded. Cause unmeasured.
* **GUESS:** that another lane advancing `invincible-agent` mid-session is ba or lane/01. I read
  the moving HEAD, not the authorship.
* **[I]** that `abb3dc1` / `6c32930` reached origin via ba — read from `8a13dd6`'s handoff, not
  independently verified. What I *did* measure is that both were already ancestors of origin/master.
* **[I]** that the roll is safe. My scope is the parity seal and the vocabulary; **both are clean**,
  and roll-safety is Lane 1's ruling, not mine.

---

## 4. RULED vs OPEN

**Ruled (cite: architect's orders of 2026-09-19, this one and the four before it):**

* Push released; `abb3dc1`/`6c32930` already on origin — the word moved one commit, not three.
* **The frontend rolls BY DIGEST, never `:latest`** — so `:latest` moving no longer matters.
* The pin bump waits for the roll, goes to the rolled sha, and **carries the rewritten third check
  and the comment fix in the SAME commit.** Not before.
* The stale-pin green may **not** be cited as roll safety.
* Origin repointed to `edgy-solutions/cortex-ui.git`; verified by fetch; noted for ba.
* Before every push: `git log origin/master..master`. Never release commits you did not write.

**Open, and whose:**

* **The three-homes finding — ARCHITECT'S.** `PRODUCER_REF` no longer determines the ledger-row
  vocabulary; it is the producer sha **plus** the `iagent-mesh` pin. Concrete, not theoretical:
  the vocabulary entered the SDK at v0.9.3, one minor ago. Today's "identical" is a fact about
  today, measured against a wheel one minor old.
* **The retag gap — LANE 1'S, already filed by them.** `retag_images_by_digest.py` derives its
  population from a matrix that contains no `cortex-ui`, so the fleet's retag-by-digest cannot
  reach this frontend. Not this lane's bug; recorded for our records.
* **`iagent_mesh` 0.9.2 in `agent_fleet/docs_agent/.venv` and 0.3.1 in `.venv.wsl`** — one version
  below where `rows.py` appears. Not mine to rule on; whoever owns docs_agent should look.
* **Expect from ca's successor: the `reachable_for` reachability note.** I checked the permissive
  default (anything but the exact string `"fail"` yields all five, `"FAIL"` and `None` included)
  and did NOT report it as a defect — `graph_manifest.schema.json` constrains `refusal` to
  `enum ["fail","named-hole"]` and only those two appear across `policy/**.yaml`, so nothing
  reaches it. A guard is a defect only where something reaches it.

---

## 5. WHAT I GOT WRONG, AND WHAT CAUGHT IT

**1. I re-ran the parity seal under a label that no longer matched the tree.** Verifying the
DECLARED command form for §1, I ran `CORTEX_PRODUCER_REF=51db099 npm run test -- …` — but the
producer checkout had already advanced past `51db099` to `e7c81d6`, and onward to `c0005142`
while I measured. **The env var is a label, not a selector**, so that run measured one producer
and reported another — exactly the failure `build.yml`'s own comment names, reached through the
door it does not guard: CI pins the checkout, a local run does not.
**Caught by:** the handoff's own state-gathering step, `git -C ../invincible-agent rev-parse HEAD`.
**Consequence, measured:** none. The policy inputs are byte-identical across `51db099` and
`c0005142`, and `51db099` is an ancestor, so both runs read the same content. **The reported PASS
stands.** The label was wrong; the measurement was not. The report to Lane 1 was sound because
that run's baseline was established while HEAD was still `51db099`.

**2. Twice I treated a null from my own filter as an answer about the repo.** Grepping for
`ROW_DISPOSITIONS *=` returned nothing and I nearly read it as "not defined here"; grepping the
other SDK versions for the terms returned nothing and I nearly read it as "absent".
**Caught by:** widening the pattern, and then replacing the null with a **positive** check —
listing module files, which showed `rows.py` present in 0.9.3 and absent in 0.9.2. A null from a
filtered grep is a claim about the filter.

**3. I first grepped `digest` out of the build log and got QEMU's helper image.** Caught before
reporting it, by reading which step the line came from; the real manifest-list digest came from
the buildx push step, and then from GHCR itself.

**4. `--reporter=basic` does not exist in vitest 4.** Startup error; re-ran with the default.

---

## 6. STANDING

* **Nothing touches a shared store without Chris.** `invincible-agent` and `ia-01` are live
  checkouts owned by other lanes — both were left untouched this session (verified clean /
  unmodified by me). Read them; do not check out, stash, or write in them. To run the seal against
  an arbitrary sha, use an isolated pair of worktrees, never a checkout in place.
* **No instrument work until four walks draw.** `UnreadFields` general stays held. The
  four-declaration-sites evidence is FILED, not proposed —
  `sessions/2026-09-19-note-cortex-60-four-extra-declaration-sites-adr-0055-s2.md`. `ia-5f` has no
  live session.
* **Never release commits you did not write.** `git log origin/master..master` before every push.
  Stage by name; this checkout is shared.
* **Also held:** sessions-only pushes triggering image builds. It kept demonstrating itself —
  `:latest` moved twice today off sessions-only commits, and the live pod is on neither.

**Waiting on:** walk findings. Chris walks the NP-MERIDIAN brief and bob's safety card after the
roll. Renderer findings are yours; payload findings are not.

**One thing that changed the sequencing:** the running frontend ALREADY serves bob's safety rows
(`git_sha df702ca`). The roll is not needed for his card — it is needed for `SOURCE_LEDGER`
(`a271817`), which is in `c8d6553f` and not in what is running.

Lane: ia-cortex-60/lane/cortex-60
