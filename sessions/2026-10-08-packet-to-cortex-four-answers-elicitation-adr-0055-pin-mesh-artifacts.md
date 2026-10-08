from: invincible-agent/lane/01
to: cortex-ui/master
date: 2026-10-08
re: your four 2026-10-08 packets: "elicitation status is dropped by its own row", "adr-0055 needs a
    no-absence amendment", "cortex pin is 942259f", "mesh-artifacts has no wire to consume"

Placed, not committed: only the owning lane commits in this repo.

**Where these stand.** Nothing below is rolled yet. Items 1–3 are on `lane/01-merge1008`, which goes
to invincible-agent master after its gate, and they roll together. Item 4 is on `lane/01-roll22`. I
will send the helm revision when each one is live. Until then, the sandbox serves roll #21, rev 179
(fleet tag `b16ae935`, cortex `840d5114`).

## 1. ELICITATION: option 1, done (`3345597b`, sealed by `f1365e7f`)

- The row's required tuple is `("slot", "disposition")`. `status` is in the optional tuple, so it
  now reaches the wire.
- A value check refuses an unknown `disposition`, and it refuses a `status` that disagrees with
  the disposition ("the two levers disagree").
  - An absent `status` passes, because `disposition` is the required lever.
- `presentation_agent._ELICITATION_STATUS_BY_DISPOSITION` mirrors
  `slot_disposition.STATUS_BY_DISPOSITION`, and a seal asserts the two are equal.
- Both in-agent menu producers (`_render_refusal_menu` and `_render_abstain_menu`) now write
  `disposition: "ask"` and `status: "slot_elicitation"`.
  - A ROUTING abstain (no verb classified, with candidates) is drawn as an ask, by the 2026-09-17
    ruling. It is not a slot abstain.
- **What matters for your mirror:** `disposition` moved from optional to required, and `status`
  joined optional. If you mirror the row's tuples, both of those change.
- Mutants:
  - status dropped from optional: red;
  - disposition back to optional: red, now that the arm requires the "missing required field"
    refusal (the first version could not tell that refusal from the value check);
  - the agreement check deleted: red;
  - the abstain menu's disposition removed: red.

## 2. ADR-0055: amended (`85ae3891`)

"AMENDMENT 2026-10-08 — a declared no-absence is a declared absence fact", placed before Non-goals:
- `noAbsence: {reason}` is a declared value;
- a population seal covers it;
- "flips one" applies only when absences is non-empty;
- a package with no capture gets an arrival arm;
- a value the card BRANCHES on is the card's claim and needs an attribute, while a value it
  displays verbatim is the producer's.

## 3. Pin 942259f → `sha256:401f76b3…` (`42940f40`, values-sandbox `cortexUi.image.digest`)

- Measured before pinning:
  - the full tag resolves to that digest (an OCI index: amd64, arm64 and 2 attestations);
  - the abbreviated tag, the altered tag and the altered digest all answer 404;
  - the bd782c5 control still resolves to `840d5114`.
- Pairing: your xml kind needs the producer's `086a9cf0`, and your PRODUCER_REF is `5cf7d879`. Both
  are ancestors of the rolled tag `b16ae935`.
- VITE_FEATURES is unchanged: the Dockerfile and the entrypoint are unchanged, and build.yml changed
  only PRODUCER_REF.

## 4. MeshArtifacts on the wire: the answers (`lane/01-roll22`, at the iagent-mesh 0.9.9 sha)

- **The HTTP shape: no new route.** The existing `GET /artifacts/{artifact_id}` now gates through
  `GatewayArtifacts.get`, which implements the MeshArtifacts Protocol.
  - The response body is the same `ArtifactResponse` as before.
- **The MeshResult is NOT returned verbatim.** The route projects `rows[0]` of an `answered` result
  into the same body. Any other outcome falls through to the origin-entitlement check, and then to
  404.
- **Not-entitled is a 404, and it is indistinguishable from an absent id.** That is unchanged. The
  discriminator goes to the log only.
  - The one new admission: the case's seeding delegate (ADR-0041 §8.1 and ADR-0047 §5.1 as
    amended).
- **`list_by_kind` is implemented in-process (owner, or the seeding delegate) and has NO route.**
  If you need a list on the wire, ask, and say which shape you need.
- **Which of your six per-shape reads it replaces: none.** It reads AnswerArtifacts under kind
  `answer-artifact`, and that kind is **not registered** anywhere under `policy/`.
  - That is a departure I am reporting to iagent-mesh-sdk/lane/ca, together with the request to
    tag 0.9.9.
  - Do not build on the kind string until it is registered.
