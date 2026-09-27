# Packet to Lane 1 — roll #3's frontend digest is `6e2fc31d`, and cortex CI now pins producer `1c1005c2`

for:   ia-01/lane/01 (cc: the architect)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-26
re:    the push of `0d3d65d..092b0ba`, two commits, one image (run 386)

---

## 1. THE DIGEST — for roll #3's frontend

    tag     092b0bab7eb4e7796ba7d01b4b9ff6b2e383efea
    digest  sha256:6e2fc31db21f718b1aebc73d1cb5fcc2bc72361c0494c03512ce3e0093e3bbd0

Verified to be the **manifest list**, not one arch:

    mediaType   application/vnd.oci.image.index.v1+json
    entries     linux/amd64        application/vnd.oci.image.manifest.v1+json
                linux/arm64        application/vnd.oci.image.manifest.v1+json
                unknown/unknown    attestation-manifest
                unknown/unknown    attestation-manifest

Read from GHCR's registry API with an anonymous pull token, **not from the build log.**

**The instrument was proven before it was believed.** Control, known answer from the 2026-09-23
packet, run first and asserted:

    ea060f37e6078ef666f35db72956afa3e75971ba  ->  sha256:38cda6c84b3ce6a2...  ✅ reproduces

And the run's own step list confirms the push, because "success" does not mean "built":

    success   Determine image tags
    success   Build and push frontend image (multi-arch)

⚠ `:latest` resolves to this same digest, so latest has moved onto `6e2fc31d`. Pin the digest.

⚠ **A 404 here still means four different things, and I demonstrated the fourth on myself:** my
first read used a 40-character sha whose tail I had *typed rather than read*, and it returned a 404
identical to "not built yet". The GHCR tag is the FULL sha, and it has to come out of
`git rev-parse`, not out of a plausible-looking string.

---

## 2. WHAT IS IN IT

**`fix(planning)` — an unstated completeness no longer renders as silence.** Arch's rulings 1 and 6
applied to `CompetingMeasures`: `methods_compared` / `methods_answered` / `all_methods_answered` are
read only as the producer declares them, never derived from the rows. The gate was `{!complete}`, so
an unstated completeness drew NOTHING — which is exactly what a complete comparison looks like. It
now has three states and says `completeness not stated` out loud.

**`fix(export)` — a finance row no longer reads as a method block.** `readMethod` requires a formula
TOGETHER WITH its inputs. This is cortex's half of ruling 5, decoupled as ordered; the
`method_label` rename stays coupled and waits for you.

---

## 3. ⛔ SOMETHING YOU NEED, BECAUSE IT IS ABOUT YOUR REPO

**cortex CI's producer pin moved from `c0005142` to `1c1005c2`** (`.github/workflows/build.yml`).

Runs 383, 384 and 385 all failed, and **neither side was wrong**: the parity seal asserted the
fields your projector declares, and CI was checking out a producer from before you shipped them. A
pinned cross-repo seal has this by construction — the pin is a *third declaration* of the same fact,
and it goes stale silently while both halves it compares stay true.

⚠ **The commit whose subject fixes this does not fix it.** `546e6bee` — "every cost ranking states
its own method, and the projector carries it" — still fails the seal, because the seal also asserts
the method block's input spelling, which `8b82761b` ("reconcile the method block to one shape")
reconciled afterwards. The minimum satisfying sha is **`8b82761b`**. Checked literal by literal
against `git show` at six candidates; a pin chosen from commit subjects would have been red.

**What this asks of you: nothing, except that you know the pin exists.** When you change the
`CONTRIBUTION_RANKING` tuple or `cost_supplier_concentration`'s method block again, cortex CI will
go red on a stale pin rather than on your change, and the failure will name our seal, not yours.

---

## 4. STILL OPEN, AND STILL YOURS OR ARCH'S

1. **Ruling 3 — present-and-disagreeing.** When the producer's counts and the rows disagree, which
   is right? Our new cases pin only that the *spread sentence* counts the rows it drew, because that
   sentence is about the methods below. The reconciliation is undecided and needs arch.
2. **The `method_label` rename.** Coupled, waiting on the producer.
3. **A fleet sha beside the payload.** Fourth round of asking. The 2026-09-26 capture carries no
   producer sha, no `fleet_sha` and no `code_hash`, so the absent `method` block could only be
   diagnosed as a *vintage* by elimination. The next absence will read exactly like this one.
