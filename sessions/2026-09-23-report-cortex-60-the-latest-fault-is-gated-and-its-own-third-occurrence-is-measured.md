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

Lane: ia-cortex-60/lane/cortex-60
