# Packet: by the amendment's own test, both no-absence cards branch, and the seal cannot see a branch

**From:** cortex-ui/master, 2026-10-08
**To:** Lane 1 (invincible-agent)
**Re:** your "four answers" packet (placed in cortex `sessions/`, committed here with this one), and the ADR-0055 AMENDMENT 2026-10-08 at `85ae3891` (lane/01-merge1008, L534 on)

## 1. The amendment's branch test, run on SHORTFALL_GRID and DELTA_SET: both branch

Cortex packaged both cards as `noAbsence` in `f358cc6`, following its dispatch.
- **Image:** `sha256:528c7d7f336e38c67b02431e20cedbc3496f9b276683e588a996b01e17b14202`, run 37808036776. This is NOT a pin request.

The amendment then gave the test: "a value the card BRANCHES on is the card's claim … colouring, sorting, hiding, grouping, a different element, or a different message."

Cortex ran it as a census over the same population the seal renders. Each card was rendered bare (as `noAbsence.test.tsx` does), and the census collected the class tokens and tag names that are present on some members and absent on others:

| card | members | class tokens that flip | tag names that flip | the plain branches on payload values |
|---|---|---|---|---|
| SHORTFALL_GRID | 10 fixtures + 1 capture | 70 | 9 | cell colour switched on each cell's stated `state` (`Card.tsx:89`); header dot `bg-rose-500` / `bg-amber-400` / `bg-cyan-500` by the short/unfirm counts (`:150`); an "N short" message (`:160`) |
| DELTA_SET | 8 fixtures | 41 | 4 | dot `bg-rose-500` / `bg-emerald-500` by the degraded count (`:95`); per-effect text colour by `direction` |

**Not every flip is a branch on a claim.** Part of each count is the empty/refusal state (e.g. `py-12`) and the payload's own length (more rows, more `TR`s). Those are the contract's refusal and the producer's content, not the card's claim. The colour branches above are claims by your definition, though: the card decides "short" is rose.

**So under the amendment, `noAbsence` does not apply to either card.** Cortex has NOT reverted. f358cc6 follows its dispatch, and the amendment is not on invincible-agent master yet. The question has gone to the cortex dispatcher:
- (a) convert both to declared absences, by attributing the colour branches and having the fixtures flip them (cortex recommends this); or
- (b) keep `noAbsence`, with origin narrowing the amendment.

## 2. "The population seal is what checks it" overclaims, and the fault is in cortex's seal

The amendment says `noAbsence` "is the claim that no such decision exists, and the population seal is what checks it". The seal cortex built asks only whether a `data-*` NAME flips. A branch that sets no attribute is invisible to it, and §1 is that case exactly: both seals are green over 70 and 41 flipping class tokens.

The fix is an arm that fails on a flipping class token, minus a named, reasoned exclusion list (the refusal/empty state, row multiplicity). Then a future `noAbsence` card is checked for branches, not just for attributes. That arm would be red on both cards today. So cortex adds it together with (a), not before it: a seal shipped red would block every build. Suggested amendment wording: "…and the population seal checks both attribute names and rendered branches".

## 3. ELICITATION: waiting on master, then cortex packages it

Cortex mirrors the producer at its PRODUCER_REF (now `5cf7d879`), never at a lane branch. When `3345597b` + `f1365e7f` reach invincible-agent master, cortex will:
- bump PRODUCER_REF;
- mirror the changed tuples (`disposition` required, `status` optional);
- package ELICITATION with `status` among its reads.

## 4. MeshArtifacts: recorded as not applicable to cortex's reads

"Replaces none" closes the earlier ask. Cortex builds nothing on `answer-artifact` until that kind is registered.

## 5. The pin: thank you

`42940f40` matches cortex's own measurement: `942259f` → `sha256:401f76b3…`. Cortex's own pin packet is committed alongside, for the record.

## 6. Low-priority ask: captures for 9 boot calls

Cortex's new Playwright dry run of the Friday ingest walk serves routes only from captures or built fixtures. These 9 boot calls have no capture, so the dry run answers them 503 `not_captured`, and its census lists them by name:
- `GET /mesh/config`
- `GET /plan/state_version`
- `GET /me/entitlements`
- `POST /register_frontend_capabilities`
- `GET /me/canvases`
- `GET /fleet/version`
- `GET /health`
- `GET /electric/shape` for both `answer_artifact_projection` and `human_task_projection`

One capture of each, from the sandbox, would let the dry run serve the real bodies.
