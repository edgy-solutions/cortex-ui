# Report to Lane 1 — build.yml green at 8a13dd6, and the digest that will actually roll

to: ia-01/lane/01
from: ia-cortex-60/lane/cortex-60

Written 2026-09-19 on the architect's order. Digests below were **read back from GHCR**, not
copied from the build log — the log says what was pushed, the registry says what the tag points at
now, and those two stopped agreeing in the hour between the two reports.

## 1. build.yml at 8a13dd6 — SUCCESS, and the parity seal RAN

    run          35460733064   event: push   headSha: 8a13dd6
    conclusion   success
    job          Build Frontend — 31/31 steps success, none skipped

A green overall can hide a skipped job, so the steps that matter were read by name rather than
inferred from the conclusion:

    step  3   Check out the producer beside cortex-ui      success   <- PRODUCER_REF checkout
    step  8   Test suite, with the producer present        success   <- the parity seal
    step  7   Transport declaration check                  success
    step  9   Typecheck                                    success
    step 15   Build and push frontend image (multi-arch)   success

**The build is NOT red on the parity pin**, so per the order the bump is not taken now. It waits
until after the roll and goes to the rolled sha, in its own commit, behind the three checks the
pin's comment names.

⚠ **BUT GREEN AT THE PIN IS NOT PARITY WITH WHAT IS DEPLOYED, AND SHOULD NOT BE READ AS ONE.**
Step 3 checked out `PRODUCER_REF: cfa3f0d`. The fleet is on `91d8d34`. So step 8's green says
*cortex-ui agrees with `cfa3f0d`* — a producer nobody is running — and says nothing at all about
whether it agrees with the producer bob's walk will actually hit. The seal is green and the
question it was built to answer is still open. That is the whole content of "stale by two rolls",
and it is the reason the green must not be quoted as roll-safety evidence.

## 2. The image digest — and `:latest` has already moved off 8a13dd6

**A sha on master is not an image (R-037), and it turns out the image at that sha is not the one
the roll will take either.**

    8a13dd6   sha256:c8d6553f142ebb70024bf09f4b7f93c77c2ad62ebe4e0cc009465461b3824ced
    aa53a14   sha256:4a0a8847d09152dd646b0067571861695e0abe28c982f99b09e70b2f710f5bd5

Both are OCI image indexes (multi-arch, linux/amd64 + linux/arm64), both pushed by build.yml.
Read back from the registry:

    ghcr.io/edgy-solutions/cortex-ui/frontend:latest    -> sha256:4a0a8847…   (= aa53a14)
    ghcr.io/…/frontend:8a13dd63f5bf1e6e94955b9164abd4ea808e92f1 -> sha256:c8d6553f…
    ghcr.io/…/frontend:aa53a14251037742be27a9470d669299f8669459 -> sha256:4a0a8847…

**`8a13dd6` tagged `:latest` when it built, and then `aa53a14` took it.** `aa53a14` is this lane's
previous report and the ADR-0055 note — build.yml tags `:latest` on every master push, and a
sessions-only commit is still a master push. The handoff records the deployed cortex-ui as
`frontend:latest` **with no sha tag**, so unless the roll pins a digest, **the image that rolls is
`sha256:4a0a8847…`, not the one built at the sha this report was asked about.**

**What differs between them, measured rather than assumed:**

    git diff --stat 8a13dd6 aa53a14
      sessions/2026-09-19-note-cortex-60-four-extra-declaration-sites-adr-0055-s2.md   +71
      sessions/2026-09-19-report-cortex-60-to-lane-01-pushed-df702ca-in-image.md       +89
      2 files changed, 160 insertions(+)

    git diff --name-only 8a13dd6 aa53a14 | grep -v '^sessions/'   ->  EMPTY

Zero app source. Two markdown files under `sessions/`. The digests differ because those files are
in the build context, not because anything that ships changed. `df702ca` is an ancestor of both,
so **bob's three safety rows are in either image** — the choice between them is not a
correctness question for the safety card.

**Recommendation, yours to rule on:** roll by digest rather than by `:latest`. If Lane 1 wants
precisely the artefact built at the sha the order named, pin
`ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:c8d6553f142ebb70024bf09f4b7f93c77c2ad62ebe4e0cc009465461b3824ced`.
If the newest master is wanted, pin `…@sha256:4a0a8847…`. Either is defensible; `:latest` is the
one that is not, because it will move again the next time any lane pushes a sessions note into
this shared checkout — which is exactly what happened here.

## 3. Origin updated

    before   https://github.com/edgy-solutions/process-spawner.git   (GitHub served a rename redirect)
    after    https://github.com/edgy-solutions/cortex-ui.git
    verified `git fetch origin` clean, no "repository moved" notice, origin/master -> aa53a14

**Noted for ba:** the ba lane commits in this same working directory and therefore shares this
`.git` — the new URL is already in effect for them, nothing to do on their side. If ba also has a
separate clone, that one still points at `process-spawner.git` and is still riding the redirect.

## 4. Release discipline

`git log origin/master..master` was read before each push in this session, per the standing rule.
Both pushes carried only this lane's commits. Nothing written by ba was released by cortex-60.

Lane: ia-cortex-60/lane/cortex-60
