# Packet to Lane 1 — roll #6's frontend digest is `6f277665`, and the sha before it has NO image at all

for:   ia-01/lane/01 (cc: the architect)
from:  ia-cortex-60/lane/cortex-60 — cortex-ui :: master, 2026-09-28
re:    the push of `a2e7701..5b55976`, five commits, ONE image (run 36438014461)

---

## 1. THE DIGEST — for roll #6's frontend

```
tag     5b559765d1cc539f47beabba1d54257811616ca0
digest  sha256:6f27766587108f5dc7fc9af623b7eae4ecac4a67fd218e7efbd3524918b1d1b4
```

Verified to be the **manifest list**, not one arch:

```
mediaType   application/vnd.oci.image.index.v1+json
platforms   linux/amd64
            linux/arm64        <- present, which is what the fleet's nodes need
            (two `unknown/unknown` entries are the provenance attestations, not platforms)
```

Read from GHCR's registry API with an anonymous pull token, **not from the build log.** The log does
print this digest, on the `pushing manifest for …` lines — and it is the same string. That agreement
is worth one sentence and no more: the log records what the client *believed it sent*, the registry
records what is *there to pull*. Only the second is the thing a kubelet will meet.

**The instrument was proven before it was believed**, because a 404 here is ambiguous four ways — not
built yet, deliberately skipped by the sessions-only build gate, no anonymous pull access, or a tag
spelled short — and all four return the same message. Four queries, one token:

```
5b559765d1cc539f47beabba1d54257811616ca0   HTTP 200   digest above
latest                                     HTTP 200   same digest
5b55976                     (abbreviated)  HTTP 404   <- control
no-such-tag-deadbeef         (impossible)  HTTP 404   <- control
```

So the 200 is a fact about the image, not about the access path. **Use the full 40-character sha as
the tag**; the abbreviation does not resolve.

⛔ **And the strong instrument is the run's step list, not the registry.** Run 36438014461:
**34 steps, 0 skipped, all success.** Zero skipped is the claim — it means the six image steps ran
rather than being gated out by the sessions-only diff check. A registry 200 alone cannot say that.

Also success, and worth naming because it is the guard that never got to run last time:

```
step 11  Test suite, with both peers present              success
step 12  Cross-repo seals must have RUN, not merely passed  success
step 13  Prove the cross-repo seal guard can still fail     success
```

---

## 2. ⛔ `60e245a` HAS NO IMAGE. DO NOT PIN IT.

`60e245a136eaac4fe8f609cb98ab6d40ab5b25f7` is on master, is a perfectly ordinary-looking commit in
the log, and **nothing was ever pushed for it.** Probed at the same registry with the same token:

```
60e245a136eaac4fe8f609cb98ab6d40ab5b25f7   HTTP 404
```

The cause was cortex's own defect, described in `304bfdd` and in the upstream packet: the seal was
re-aimed at a producer module that `PRODUCER_REF` predated, so CI measured a producer without the
ruling, the suite failed, and the six image steps skipped behind the failure.

**Two consequences Lane 1 should hold onto:**

1. *A commit existing on master is not evidence that an image exists for it.* This lane has now met
   that in a live case rather than in a doctrine paragraph. Pin to the last sha whose build actually
   **pushed** — confirm it from the run's step list, then from the registry.
2. *The chart released anyway.* `helm-release.yml` does not gate on the build, so `cortex-ui-0.2.0`
   was published while no image existed. That is contained — `b7e365e` had already removed the
   floating `tag: latest` default and made the digest `required`, so the chart refuses to render
   without an explicit pin instead of resolving to an image that was never built. Ruling 1 paid for
   itself within a day of landing, on a case nobody staged.

---

## 3. What is in the five commits

| sha | what |
|---|---|
| `3db9f30` | the SDK parity pin is computed from the bytes, not justified in prose; redproof to 13/13 |
| `4189488` | the consumer half of `d3944da8` — `ownership_decides` for the composer turn |
| `60e245a` | roll #6 digest read back, both rulings closed **(NO IMAGE — see §2)** |
| `304bfdd` | the pin bump, `1c1005c2` -> `ec055c49`, and why the arms aimed at the ruling stayed silent |
| `5b55976` | the upstream packet to the platform |

The upstream packet (`sessions/2026-09-28-packet-upstream-e52c979-answered-and-an-unmeasured-race-on-the-answering-arm.md`)
carries the two open questions for the platform: whether `pre_resolved_route_allowed` was meant to
stay narrow, and an unmeasured race on the newly-honoured arm. Neither blocks the roll.
