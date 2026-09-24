# Report — the `:latest` fault is gated in CI, and its third occurrence was measured on the way

for:   the architect (cc: ia-01/lane/01)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-23
re:    the 2026-09-23 follow-on order — push the held pair, then gate the image build

    pushed   e1e1fa4  (458aa20 + e1e1fa4, the held pair)
    pushed   1e31d92  ci(build): a sessions-only push stops moving `:latest`
    held     nothing
    tree     clean

---

## 1. THE HELD PAIR IS OUT, AND IT DID THE THING ONE LAST TIME

`458aa20` and `e1e1fa4` are on master. As you predicted, that push built an image and moved the
tag. **Measured, not assumed:**

    :latest                                   -> sha256:455a4c900579794e36c543f45e3eb87a8832f0a1625dbb6b2f7b7e10503bc1ea
    tag e1e1fa4... (the sessions-only push)    -> sha256:455a4c9005797943...   SAME

    control, known answer, proving the instrument:
    ea060f37e6078ef666f35db72956afa3e75971ba   -> sha256:38cda6c84b3ce6a23...

So `:latest` is **off `28f752f2`**, the digest you accepted an hour ago, and onto an image whose
entire diff from it is two sessions files. **That is the third occurrence of this fault** — after
`8a13dd6` and `a6950b2` — and the first one that was watched happening rather than discovered
afterwards. Roll #2 is pinned by digest and has not moved; `28f752f2` is still pullable by tag and
by digest, and nothing was deleted.

**It is also the last one.** Anything sessions-only pushed from here builds no image at all.

---

## 2. THE GATE — `1e31d92`

Modelled on doc-tools PR #7 (`f89720e`), with one structural difference that decides the design.

### What was copied

A `changes` job that computes the verdict with a **plain `git diff`** — no `dorny/paths-filter`,
so the semantics are auditable by eye — exposes it as an output, and is consumed by an `if:`. The
three-dot `BASE...HEAD` form, against the merge base, because two-dot attributes every commit the
base gained since the branch point to this diff and makes the skip fire almost never. And the same
fail-open discipline: a tag push, a non-push event, an all-zeros base, an unresolvable sha, a
failed diff, an empty diff — all fall through to `code=true`. **Zero changed paths is proof to
distrust the computation, not proof that nothing needs building.** One path to `code=false`.

### ⛔ What had to differ, and why it is the important part

**doc-tools has three jobs; cortex-ui has one.** There, the `if:` goes on `build-and-push` and
`telemetry-contract` + `tests` keep running. Here, a job-level `if:` would take the transport
guard, the 1599-test suite, the parity seal and `tsc` down with the image build.

> This file already records what that costs. Its own `frontend` header says the parity seal **had
> never run in CI** — a single `actions/checkout` left the producer absent on every build since the
> seal landed, so 28 assertions silently skipped while every build looked green. **A gate that
> quietly stops a seal from running is that same incident wearing a different hat.**

So the `if:` went on the **steps**, not the job. Verified by parsing the YAML rather than reading
it:

    GATED (6):    Set up pack CLI · Set up QEMU · Set up Docker Buildx
                  Log in to GHCR · Determine image tags · Build and push (multi-arch)
    UNGATED (8):  Checkout · Check out the producer beside cortex-ui
                  Put the producer where the seal looks · Set up Node · Install dependencies
                  Transport declaration check · Test suite, with the producer present · Typecheck
    frontend job-level `if:`  — (none)

A sessions-only push still runs `check:transport`, the full suite and `tsc`. It just produces no
image. The skip is visible in the log as skipped, not absent.

---

## 3. THE ALLOWLIST, AND THE PROOF IT IS AN ALLOWLIST

`^sessions/` and `^docs/`. **Paths proven unable to reach the image — not a denylist of things
that feel unlike code.** Measured today:

* Nothing under `src/`, `tests/` or `scripts/` imports, requires, reads or fetches a path under
  `docs/` or `sessions/`. Every single reference is a **prose citation inside a comment** —
  including `ShortfallGrid.contract.ts:38`, which names a `sessions/` payload in the comment block
  written this morning and does not load it.
* The Dockerfile's final stage copies only `/app/dist`, `nginx.conf` and `docker-entrypoint.sh`,
  and names neither directory.

**`helm/` must never join the list**, and the comment in the file says so in those words. It is the
exact analogue of doc-tools' `charts/` warning: a values file is not code, it is what *deploys*,
and it carries the image pin. A helm-only diff is the one that most needs its image to exist.

---

## 4. THE REDPROOF — because a gate that can only say "build" is a comment

The decide step was extracted from the parsed YAML and run against **real shas in this repo**. Ten
cases, and the point is that **both answers occur**:

    a6950b2..e1e1fa4   sessions-only                  code=FALSE   <- the push that prompted this
    7b3afbd            one sessions/ commit alone     code=FALSE
    ea060f3..a6950b2   range containing src/          code=true
    091b26c            one src/ commit alone          code=true
    a6950b2..e1e1fa4   same diff, as a TAG push       code=true
    all-zeros base (new branch / force-push)          code=true
    base sha not in this checkout                     code=true
    empty diff (head == base)                         code=true
    workflow_dispatch, same sessions-only diff        code=true
    empty base sha                                    code=true

**Row one is a measurement of the fault, not a demonstration of the design.** `a6950b2..e1e1fa4`
is the push that moved `:latest` off `38cda6c8`. Had this gate existed that morning, it would not
have. The table and the re-run recipe are committed **in the workflow file itself**, beside the
job, because a decide step that had only ever returned `true` would look identical to this one in
the checks list.

---

## 5. WHAT THIS COMMIT ITSELF DOES

`1e31d92` touches `.github/`, which is outside the allowlist, so the gate answers `code=true` on
its own diff and builds an image. **That is the gate working, not a hole in it.** Its digest
follows in a separate line to lane 1 once GHCR has it; the poll is running with the control
already proven.

**The next sessions-only push in this seat is the live proof.** If this report's own commit builds
no image and `:latest` does not move, the gate is doing in CI exactly what it did on my bench.
I will say either way.

---

## 6. NOT DONE, ON PURPOSE

* **The transport-guard blind spot** — `client.ts:58`, a live undeclared `axios.get<Entitlements>`
  site the guard's regex cannot see because it does not allow for a generic before the paren.
  **Recorded and held, per your order; not touched in this pass.** It remains true that
  `check:transport` reports "all accounted for" while an unaccounted site ships.
* **ADR-0055 step 2** — not started. Waiting on Chris's walks recording the three cards.
  COMPETING_MEASURES first when it opens, and the undercount banner is at the head of the
  inventory for whoever runs it.


---

## 7. THE GATE COMMIT BUILT, AND `:latest` HAS NOW MOVED FOUR TIMES

    tag 1e31d925...  ->  sha256:62ae12c042be1cad15fa692ceca7a3e46a800d0ff135105ea4d6405f0c65aabd
    :latest          ->  sha256:62ae12c042be1cad15... , the same, and a manifest list

**That the image exists at all is the finding.** A workflow file that `js-yaml` parses can still be
rejected by Actions; this one was not. The gate answered `code=true` on its own `.github/` diff and
built, which is it working rather than a hole in it.

So the full chain, and the architect's note updated by one:

    38cda6c8   accepted for roll #2
     -> 28f752f2   a6950b2  — accepted, then displaced
     -> 455a4c90   e1e1fa4  — SESSIONS-ONLY, the fault, the last free one
     -> 62ae12c0   1e31d92  — the gate itself; a real change, a legitimate move

**Roll #2 is pinned by digest at `28f752f2` and has not moved.** Lane 1 should re-arm with
`28f752f2` as ordered. Nothing behavioural differs across the four: build metadata, two sessions
files, and the workflow change — none of which reaches `/app/dist`.

---

## 8. THE LIVE TEST, PREDICTED BEFORE IT RAN

This report is the test. It is sessions-only and it is pushed on top of `1e31d92`, so the gate that
judges it is the one just landed. **Stated in advance:**

    EXPECT   no `:<sha>` tag in GHCR for this report's commit — a 404 that MEANS something
    EXPECT   :latest still sha256:62ae12c0... , unmoved
    EXPECT   check:transport, 1599 tests and tsc all RAN

**If an image appears, the gate failed open** — the safe direction, and the finding goes here
rather than being read as a non-event. doc-tools recorded that its own PR #7 exercised `code=true`
only and that the skip branch had never run; cortex is ahead of that by one step, because the
bench redproof in §4 drove `code=false` on real shas before anything was pushed. **What is still
untested is the branch running in Actions, not the branch existing.**

⚠ And the 404 that confirms a pass is the same 404 that means "not built yet." **The control
separates them**, and it must be read in the same breath: `ea060f37e60... -> sha256:38cda6c8...`
resolving proves the instrument, and `1e31d925... -> 62ae12c0` resolving proves builds are landing
right now. Only then is an absent tag evidence of a skip.

---

## 9. AN UNORDERED FINDING, BECAUSE IT IS THE OTHER HALF OF THE SAME HAZARD

doc-tools carries the consequence rule: once the gate is in, **not every sha on the default branch
has an image**, so every runbook sentence of the form "pin the chart to the merge sha" becomes
**pin to the last sha whose build actually pushed.** Their failure mode is that `values.yaml` uses
`required` — which refuses an ABSENT tag but renders a never-built one perfectly, then fails at the
kubelet with `ImagePullBackOff` minutes after Helm reports success.

**Cortex is worse off than that, measured just now:**

    helm/cortex-ui/values.yaml:20        tag: latest
    grep -rn "required" helm/            (no hits — no guard of any kind)

So cortex has neither the `required` refusal nor a sha default: **the chart's own default tracks
the floating tag**, which is the exact hazard the registry-side gate just closed. The rule goes into
cortex's `CLAUDE.md` as ordered, and it has to say *pin at all*, not just *pin carefully* — the
chart will not stop anyone.

**I am not changing the chart default.** That is a deploy-affecting edit, no order covers it, and
`helm/` is deliberately outside the build allowlist precisely because values are what deploy.

---


---

## 10. ✅ THE LIVE TEST PASSED — ALL THREE LEGS, AGAINST TWO LIVE CONTROLS

`f43f95f` — this report, sessions-only, pushed onto `1e31d92` so the gate judging it is the one
just landed. Run `35949083786`, **completed / success**:

    JOB: Does this diff need an image?    success
         success   Decide whether this diff can skip the image build

    JOB: Build Frontend                   success
         success   Checkout
         success   Check out the producer beside cortex-ui
         success   Put the producer where the seal looks for it
         success   Set up Node
         success   Install dependencies
         success   Transport declaration check      <- RAN
         success   Test suite, with the producer present   <- RAN
         success   Typecheck                        <- RAN
         skipped   Set up pack CLI
         skipped   Set up QEMU
         skipped   Set up Docker Buildx
         skipped   Log in to GHCR
         skipped   Determine image tags
         skipped   Build and push frontend image (multi-arch)

Against the three predictions in §8, in order:

    no `:<sha>` tag for this commit     f43f95f0... -> http=404, and the run is COMPLETE, so final
    :latest unmoved                     sha256:62ae12c0... , exactly where 1e31d92 left it
    the checks all RAN                  8 success, and only the 6 image steps skipped

**The 404 is only worth anything because two controls resolved beside it**, and both did:

    ea060f37e6...  -> 200   the instrument works at all
    1e31d925...    -> 200   built SIX MINUTES EARLIER — builds are landing right now

Without the second, "no image" and "GHCR is not answering me" are the same reading. And the step
list is the stronger instrument than either: **an absent tag cannot tell a skip from a run that
never started**, while `skipped` next to `success` says which. Cost, incidentally: **113s against
219s.**

### The before/after, same instrument, same class of diff

| push | diff | workflow | `changes` | image steps | result |
|---|---|---|---|---|---|
| `e1e1fa4` | sessions-only | **old** | absent | all 6 ran | image built, `:latest` moved — **the fault** |
| `1e31d92` | `.github/` | new | `code=true` | all 6 ran | image built — correct |
| `f43f95f` | sessions-only | new | `code=false` | **all 6 skipped** | **no image, `:latest` held** |

Row one and row three are the same kind of push twenty minutes apart. **That pair is the
measurement.** doc-tools noted its own PR #7 had exercised `code=true` only and that the skip
branch had never run; cortex's skip branch has now run in Actions, not just on a bench.

**`:latest` is no longer a hazard for sessions-only work in this seat.** The standing rule that
held reports unpushed so they would not build a second image is **retired** — that is what this
report's own push just demonstrated.

---

## 11. WHAT WENT INTO `CLAUDE.md`, AND THE ONE THING I WOULD NOT DO UNASKED

The consequence rule is now in the lean-session card as its own section, because it is the kind of
thing a fresh session must not have to rediscover: **not every sha on master has an image, so pin
to the last sha whose build actually PUSHED**, confirmed from GHCR or the run and never from the
commit log. It carries the cortex-specific sharpening from §9 — that this chart has no `required`
guard and defaults to `tag: latest`, so it will not stop anyone — and the `helm/`-must-never-join
warning.

⚠ **That `CLAUDE.md` commit is at the repo root, outside the `^sessions/|^docs/` allowlist, so it
builds an image and moves `:latest` once more.** That is the allowlist doing exactly what it was
told. **I did not widen it to cover root-level markdown, even though `CLAUDE.md` provably cannot
reach the image** — the handoff measured that in §3.7 — because the allowlist you specified is
`^sessions/` and `^docs/`, and quietly growing a list whose entire value is that every entry was
proven is how it stops being an allowlist. **If root-level `*.md` should be on it, that is your
call and I will make it in one line.**

---


---

## 12. TO LANE 1 — THE CURRENT DIGEST, AND THE GATE.'.S TRUTH TABLE FROM PRODUCTION

    tag fb7f3104...  ->  sha256:567b96e70f7e0671be5f84911de1ea204a2ec575a44c369e5dfe76eecd7c8d3b
    :latest          ->  the same
    mediaType        ->  application/vnd.oci.image.index.v1+json, linux/amd64 + linux/arm64
                         plus two attestation manifests  — a manifest list, not one arch

That is the `CLAUDE.md` commit, and its run shows **zero skipped steps** — the gate answered
`code=true` on a root-level file, correctly, because root markdown is not on the allowlist.

**Roll #2 stays pinned at `28f752f2`. Nothing above changes that.** Across all five images the only
differences are build metadata, sessions files, the workflow, and a markdown card — none of which
reaches `/app/dist`.

### Four production runs, both answers, no bench

| run | push | changed paths | `changes` | skipped | image |
|---|---|---|---|---|---|
| `35948355616` | `e1e1fa4` | `sessions/` | **no gate yet** | 0 | built — `455a4c90`, `:latest` moved. **the fault** |
| `35948694886` | `1e31d92` | `.github/` | `code=true` | 0 | built — `62ae12c0` |
| `35949083786` | `f43f95f` | `sessions/` | `code=false` | **6** | **none. `:latest` held.** |
| `35949408301` | `fb7f310` | `CLAUDE.md` + `sessions/` | `code=true` | 0 | built — `567b96e7` |

Rows one and three are the same class of push either side of the gate. Rows three and four are the
same repository twenty minutes apart, answering differently because the paths differed. **A gate
that had only ever said `true` would be indistinguishable from row two alone** — which is why row
three exists and why it was predicted in §8 before it ran.

**One consequence to carry rather than re-derive:** `:latest` is now a reliable pointer to the last
sha that actually shipped code, which it was not this morning. It is still not a pin — §9 stands,
and this chart defaults to it.

---

Lane: ia-cortex-60/lane/cortex-60
