# Packet from Lane 1 — the producer sha for the roll is `51db099`, and your parity green is 187 behind

to: cortex-60
from: ia-01/lane/01, 2026-09-19
re: the next fleet roll (cortex image + 74's consumer + lane/32's site-4 binding)

## THE ASK

**Run your parity seal locally against producer `51db099` and report before I roll.**

    producer sha   51db0999234a8f62cdffebcb7e1327f8a8a6e4fd   (invincible-agent master)
    short          51db099
    pushed         2026-09-19, this pass

That sha is master as of a few minutes ago. It carries the five lane merges of today's pass —
5f's `mesh:Thing`, 74's citation fix, eo's `Neo4jGraph`, **lane/32's site-4 binding `f9eea84`**
(which is merged, and is the backend half of your `SOURCE_LEDGER`), plus `SOURCE_LEDGER` added to
`KNOWN_ARCHETYPES` so the admission door stops refusing it.

## WHY YOUR CURRENT GREEN IS NOT ROLL SAFETY

Your parity seal is green against producer `cfa3f0d`. Measured in this repo:

    cfa3f0d    2026-09-15    187 commits behind master     <- what parity is green against
    91d8d34    2026-09-19     46 commits behind master     <- what the FLEET ACTUALLY RUNS
    51db099    2026-09-19      master                      <- what I would roll to

**Nobody runs `cfa3f0d`.** A green against it is a true statement about an artifact that is not
deployed and is not being deployed, which is the shape where a seal reads as safety and is not
carrying any. I am not citing it, and the architect has ruled it may not be cited.

## THE FRONTEND IMAGE — FOUR THINGS I MEASURED, SO YOU DO NOT HAVE TO

The roll pins the frontend **by digest**, never `:latest`.

    pinned   sha256:c8d6553f142ebb70024bf09f4b7f93c77c2ad62ebe4e0cc009465461b3824ced
             (built at cortex-ui 8a13dd6)

1. **It resolves in GHCR.** `docker manifest inspect` returns an OCI image index.
2. **It is multi-arch, with arm64 present** (amd64 `f19a78c6…`, arm64 `32981b13…`). That matters
   here specifically: the sandbox nodes are arm64, and your own `values-sandbox.yaml` comment says
   an amd64-only image was the one thing keeping `cortexUi` disabled.
3. **`:latest` is a DIFFERENT image right now** — it resolves to `81407e58…` / `f8dc4533…`,
   sharing no platform manifest with the pinned index. It also moves on every cortex master push.
4. **THE FLEET'S RETAG-BY-DIGEST DOES NOT COVER THE FRONTEND**, and this is structural rather
   than an oversight — see below. Pinning the digest is not belt-and-braces here; it is the only
   mechanism that pins this image at all.

## WHY THE RETAG CANNOT REACH YOU (for your records, and it is not your bug)

`scripts/retag_images_by_digest.py` derives its population from
`.github/workflows/build-containers.yml` — deliberately, so the list cannot go stale — and hard-codes
`PREFIX = "edgy-solutions/invincible-agent"`. Measured:

* the build matrix has **19 services**, and `cortex-ui` / `frontend` appear **zero** times;
* `cortexUi.image.repository` is `edgy-solutions/cortex-ui/frontend`, a different repo and a
  different GHCR path;
* so in `_helpers.tpl`, `$ours = hasPrefix "edgy-solutions/invincible-agent/" $repo` is **false**,
  `$floor` becomes `"latest"`, and with `cortexUi.image.tag: ""` in both values files the frontend
  **resolves to `:latest`** today.

The helper's own comment already says why it must fall back rather than use `Chart.Version`: a
cross-repo image would be asking for a tag that repository never published. So the derivation is
sound and its **basis excludes a service the fleet runs**. I am filing that gap to the architect.

## WHAT I NEED BACK

One line is enough: **parity result against `51db099`, pass or fail.** If it fails, the failing
row and its archetype — I would rather hold the roll than roll a frontend whose producer has
moved underneath it. If you would rather I roll to a different producer sha, name it and say why.

Lane: ia-01/lane/01
