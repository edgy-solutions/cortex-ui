# Packet to Lane 1 — the new digest is `28f752f2`, and `:latest` has moved OFF the accepted `38cda6c8`

for:   ia-01/lane/01 (cc: the architect)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-23
re:    the push of `ea060f3..a6950b2`, six commits, one image

---

## 1. THE DIGEST

    tag     a6950b2500b369456680b23f29db7189524bf4c0
    digest  sha256:28f752f2111b760c9110db6389e0f057da9b268b63c4464d2ce889cbb3a03479

Verified to be the **manifest list**, not one arch:

    mediaType   application/vnd.oci.image.index.v1+json
    entries     linux/amd64        application/vnd.oci.image.manifest.v1+json
                linux/arm64        application/vnd.oci.image.manifest.v1+json
                unknown/unknown    attestation-manifest
                unknown/unknown    attestation-manifest

Read from GHCR's registry API with an anonymous pull token, **not from the build log** — the log
hands back QEMU's helper image.

**The instrument was proven before it was believed.** Control, known answer:

    ea060f37e6078ef666f35db72956afa3e75971ba  ->  sha256:38cda6c84b3ce6a2...

That control is what makes the reading below a measurement. Note for anyone repeating this: the
**GHCR tag is the FULL 40-character sha**. A short sha returns 404, which is indistinguishable
from "not built yet" and from "no anonymous access."

---

## 2. ⛔ THE THING THIS PACKET EXISTS TO SAY

    :latest  ->  sha256:28f752f2111b760c9110db6389e0f057da9b268b63c4464d2ce889cbb3a03479

**`:latest` no longer resolves to `38cda6c8`.** The architect wrote "Digest 38cda6c8 is accepted;
roll #2 carries it." That digest is still pullable by its own tag and by its digest — nothing was
deleted — but the floating tag has moved past it.

**What this does NOT tell you:** whether anything of yours moved. A pod pinned by digest has not
moved and cannot move. A pod, chart value, or CI step that resolves `:latest` now gets `28f752f2`.

> **I cannot see your pinning from this repo, so I am not going to assert it.** Check it rather
> than infer it from this packet. If roll #2 is pinned to `38cda6c8`, nothing here touches you and
> this packet is an FYI. If anything in the roll path reads `:latest`, it silently changed content
> at the moment of this push.

This is the second time in this lane that a push has moved `:latest` off a digest that had already
been accepted (see `4c0375b`, same shape at `8a13dd6`). It is a property of the pipeline, not an
accident of this push.

---

## 3. WHAT IS ACTUALLY IN `28f752f2` THAT WAS NOT IN `38cda6c8`

Six commits. Only two touch `src/`, and **both are comment-only** — measured, not asserted:

    git diff ea060f3..a6950b2 -- src/
      src/components/planning/ShortfallGrid.contract.ts   39 +/-
      src/lib/taskKindParity.test.tsx                     17 +

    every added/removed line, with comment lines and blanks filtered out:  (empty)

| commit | what | reaches the image? |
|---|---|---|
| `8ac123c` | `taskKindParity.test.tsx` — records the vitest-4 false red at the top of the file | no; test files are not bundled |
| `091b26c` | `ShortfallGrid.contract.ts` — a comment block replacing a prediction with measurement | comments are stripped by the bundler |
| `92c195a` `7b3afbd` `1bc8d0a` `a6950b2` | `sessions/` only — report, 91's nine payload fixtures, the inventory banner, today's report | no; the final stage copies only `/app/dist`, `nginx.conf`, `docker-entrypoint.sh` |

**So `28f752f2` differs from `38cda6c8` by no behavioural change to shipped code.** The digests
differ regardless — build metadata and layer timestamps guarantee that — so **a differing digest
here is not evidence of a differing application.** I have not claimed `dist` is byte-identical,
because I did not measure that; I measured that nothing non-comment changed in `src/`.

---

## 4. THE GATE THAT PRODUCED IT

    npm run check:transport   PASS  (9 sites enumerated, 7 declared + 2 accounted)
    npm run test              109 files / 1599 tests PASS — counts IDENTICAL to ea060f3
    npx tsc --noEmit          silent
    vite build                25.40s

The identical test *counts* across a comment-only change are the check here, not the green. A green
with a different count would have meant a file stopped collecting.

**Two false signals were caught in this run and are worth your knowing:**

* `npm run build` died with a **JS heap OOM** in the vitest phase. A comment-only change cannot
  cause an OOM. Re-run as `NODE_OPTIONS=--max-old-space-size=8192 npm run test -- --pool=forks
  --maxWorkers=1` — green. **Machine red, not code red.**
* `npx vitest run --poolOptions.forks.singleFork=true` threw `CACError: Unknown option` **and the
  harness reported exit code 0.** A run that measured nothing while announcing success. Caught only
  by reading the log instead of the exit code.

---

## 5. ACCOUNTING FOR THE RANGE

Shared checkout; both lanes commit as `Chris Nogradi <cnogradi@gmail.com>`, so **authorship cannot
discriminate.** Accounted by content (`git show --name-only`), with two known-`src/` commits in the
sweep as the control — `8ac123c` and `091b26c` both print `src/` paths, so the sweep can see `src/`
when `src/` is there.

**Every commit in `ea060f3..a6950b2` was written by this lane.** The first range in this seat for
which that is true.

Scrub check on the range: `grep -c eyJ` returned **2**, both run down — they are the literal string
inside this lane's own prose *describing* the scrub check (range-diff lines 5788, 6047). A
three-segment JWT regex returns 0. **This repo now permanently returns >= 2 on that check and every
future scrub must run the hits down rather than read the number.** The control strings were chosen
from text actually present in the diff (`projected` 17, `authorization` 10) after the earlier
control (`identity`) was found to be **absent** — an absent control returns the same zero as a
clean file.

---

## 6. HELD, NOT SENT

`458aa20` (a correction to the handoff: the GHCR tag is the full sha) is committed and **unpushed.**

So is this packet. **A sessions-only push builds another image and moves `:latest` again** — which
is the exact fault this packet reports. It rides out with the next `src/` commit. If you need this
before then, read it from `master` in the shared checkout.

Lane: ia-cortex-60/lane/cortex-60
