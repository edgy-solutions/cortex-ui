# Report: `/case/{id}` and `/ask?q=` landed at `b3bdab7`, which pins in 196

from: cortex-ui/master, 2026-10-17
re: the architect's OpenDDIL link shapes (items 1 and 2 are cortex's; item 3, `GET /cases/{id}/action`, is Lane 1's)

## Landed

- **`b3bdab7`** = `b3bdab736ffd21962b75ed2d355f213b807888a4` → `sha256:94599a96a5ee7f563473d51ba757393acc8e92e6794dd22f810d17d7875bccd3`.
  - CI run 39083636669: every step succeeded, including "Build and push".
  - GHCR controls: the short tag and a fake tag 404; the known-good `10f64f1` answers 200.
- **The packet to lane/01** (cc the architect) is placed, uncommitted, in
  invincible-agent's `sessions/`. This lane's copy is
  `sessions/2026-10-17-packet-to-lane-01-cortex-link-shapes-case-and-ask-landed-b3bdab7-pins-in-196.md`.
  It gives the two URL shapes, their encoding, and what the person sees.

## Proofs

- **Mutants: 27 of 30 killed.**
  - The three survivors are single layers of `safeReturnTo`'s guard (`//`, backslash, origin).
    WHATWG parsing reads `\` as `/`, so every hostile form is refused by two layers.
  - Dropping all three layers together is killed.
  - My review added the arms that killed three earlier survivors: focus on the artifact id, not
    the row id; a decided approval that still carries a task; a store row that is no longer
    pending.
- **Wiring census.** Every `.signinRedirect(` call in shipped source must pass `signinArgs()`, with
  a floor of 3 calls. The one `onSigninCallback` must be `afterSignin`. A reverted login button
  would otherwise drop the link with every unit test still green.
- **Gates:** tsc 0, `check:transport` 0 (no new fetch site; the case link reuses `fetchCase`),
  `build:bundle` 0.

## For a human

1. **The 5 s timeout flakes have spread.** The full suite read 17 failures: the 13-failure
   baseline plus 5 s timeouts in three tests that walk the source tree:
   - `sessionIsolation` (2);
   - `askFold`;
   - `projectedTupleParity`.

   All 85 pass alone. Last beat only `sessionIsolation` timed out. These are tree-walking scans,
   and the tree grows with every beat. A raised `testTimeout` for those files, or caching the
   walk, is the fix. Not done here.
2. **The Lane 1 SPKI packet is left UNTRACKED.** That is
   `sessions/2026-10-17-packet-to-cortex-the-sandbox-spki-pin-evidence-quality-and-68f56bb-pinned-for-194.md`.
   It carries the sandbox SPKI pin value. Lane 1 calls it public and says it is already committed
   in their runbook, but this lane's standing rule is never to commit the pin value. Committing it
   is a call for Chris. Its other two sections need nothing from cortex:
   - `quality` is already read;
   - `68f56bb` is live at revision 199.
3. **Login is not started automatically on a deep link.** The person still clicks the sign-in
   button, and the link survives the round trip in OIDC state. If the dry-run wants a click-free
   entry, that is a one-line change, but it is a product choice.
