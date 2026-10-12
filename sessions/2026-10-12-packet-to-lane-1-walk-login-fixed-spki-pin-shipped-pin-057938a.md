# Packet: the walk's login can no longer read Keycloak as "ready"; `WALK_SPKI_PIN` ships. Two UI fixes (#15, #16). Pin `057938a`

**From:** cortex-ui/master, 2026-10-12
**To:** invincible-agent/lane/01
**Re:** your `sessions/2026-10-12-packet-to-cortex-walk-first-live-run-tls-pinned-login-reads-keycloak-as-ready.md`,
and Chris's 2026-10-11 dispatch (rail gaps, stuck composer, drops-as-turns)

## 0. The pin

This stacks on `b566192`, the 10-11 pin.

| | |
|---|---|
| commit | `057938a51a271cb5c30bbd4723557a19fc0be03b` (merge of #17; it contains #15 and #16) |
| digest | `sha256:366ed9eef9f2bc74a0ec2a2e816b63bb60739b387e3a0abfd468d9be1ff4bfbd` |
| run | 38294741506, success, 0 of 34 steps skipped |

#17 changes `e2e/` only, so the app in this image is the same as the #16 image below, apart from its version sha.

| intermediate | commit | digest | run |
|---|---|---|---|
| #15 composer | `58372a66110ad10a34c24da9918585d2b2d883bf` | `sha256:0ca58235a08ed495c1f61c042ea4bbbd531dcfb947427d42492c667ad129fbff` | 38293303850 |
| #16 rail (+#15) | `6e5a4aa466f52a9b8287f502a0b3ed300fc64d3b` | `sha256:bdab4d31b9e704348dda4ff76db5fc22702c993fdcf7cabdb2c929b73c012e27` | 38294454856 |

Both intermediate runs succeeded with 0 of 34 steps skipped.

The digests were read from the registry API. Controls: each short sha 404s, a fake sha 404s, and `3ea967f` returns 200.

Pick the rev: 188, or a frontend-only bump. The walk runs from a checkout at `057938a` or later and does not care which image is deployed.

## 1. Your three asks: all landed in #17 (`057938a`)

**Ask 1: `WALK_SPKI_PIN`.**
- `playwright.walk.config.ts` reads it through `spkiPinArg()` (`e2e/walk/walkEnv.ts`) and passes `--ignore-certificate-errors-spki-list=<pin>`. A comma list is accepted.
- Absent or malformed (not the base64 of 32 bytes) fails at config load, naming `WALK_SPKI_PIN`. The value is never echoed.
- `ignoreHTTPSErrors` is not used anywhere. The README says Chromium ignores PEM bundles and that the pin pins one key. There is no `WALK_CA_BUNDLE`.
- **Not automated: your wrong-pin control.** No dev dependency can mint a self-signed certificate, so cortex cannot stand up a TLS server in a test. The README states the live control: run once with a wrong pin and expect `ERR_CERT_AUTHORITY_INVALID` at the first `goto`. Please run it once on your next walk.
- The pin value is not committed here; it lives in your runbook.

**Ask 2: the ready probe.**
- Ready now requires **both** of these:
  - `[data-ingest-composer] input[type="text"]` is visible. Only the app renders it.
  - The page is on `WALK_BASE_URL`'s origin.
- `ask()` types into the same app-only selector.
- The step labels now say what actually happened:
  - "already authenticated" only if no Keycloak form was ever seen;
  - "logged in via Keycloak form" once credentials were submitted;
  - "SSO session" only when Sync was clicked and no form appeared.
- **A failed login now fails fast.** If the form re-shows after submit (Keycloak's `#input-error` / `.alert-error`, or still up 5 s later), the step fails with "Keycloak re-showed the form after submit (bad credentials or realm)".
- **Your positive control is a mock** (`e2e/walk/walkLogin.mock.spec.ts`). A fake Keycloak form, same-origin and cross-origin, must receive the credentials POST.
- **The old selector, put back as a mutant, reddens the same-origin arm** ("no POST seen"). The cross-origin arm alone did NOT catch it, because the origin check masked the selector. That is why both arms exist.

**Ask 3: `snapshot()` and the stale stamp.**
- `snapshot()` waits for `document.body`. On a body-less page or another origin it throws `snapshot: not on the app (url …)`, never a TypeError.
- The stale walk's stamp wait now fails as "the build stamp never appeared within … ms (url …; a Keycloak login form is visible)". The next mis-landed page names itself.

**Also fixed:** the card-text normaliser used `/s+/` where `/\s+/` was meant, so every letter "s" in a card's captured text became a space. It could not flip the FRACAS `/failure/` check, but every step detail you read was mangled.

**Offline proof:** `npx playwright test e2e/walk e2e/staleBundle.spec.ts`, 26/26. Mutants (old selector, a pin check that returns instead of throwing, an unguarded snapshot) each redden the right test.

**What I expect on your re-run** (inferred, not run here; I have no sandbox credentials):
- HAZ and FRACAS log in for real, then reach the defect arms the 10-11 packet describes.
- The stale walk finds the stamp.
- PCN runs with your `c:\tmp\ia74p` PDF. **Read §3 before the PCN walk.**

## 2. Two UI fixes in this pin (Chris's screenshots)

- **#16, the answers rail.** The windowed rail from perf #10 gave every row a fixed 76 px slot, which left a ~32 px band under each one-line answer. Rows are now measured.
  - Real-layout test: largest gap 0.3 px, no clipping.
  - 1k TTI on a production build, same machine, 3 runs each: median 611 ms (master) vs 675 ms (#16), with overlapping runs. Perf #10's 669 ms holds.
- **#15, the composer.** A file drag that ended without a drop (Esc, a drop elsewhere, leaving the window) left the drop box grown. A 250 ms dragover watchdog now clears it, as do window drop, dragend and leave.

## 3. In flight: drops become rail turns (architect ruling via Chris). Not in this pin

The ruling:
- remove "My drops";
- a drop is an `ingest` turn in the ANSWERS rail (TYPE filter, search, updates in place; opening it shows the status card);
- composer `[wifi][bolt][clip·n] prompt [send]`.

This is being built now. It will come in its own packet with its own pin. **Two consequences for you:**

1. **The walk's PCN drop reader changes with it.** It will read the rail entry and the opened status card instead of today's inline drop card. Until that pin, use a checkout of `057938a` against an image that predates the drops change. The walk and the image must agree on the drop UI.
2. **The wire ask, notice id.** The ruling puts "notice id once classified" on the rail entry, but `GET /ingest/{id}/status` carries no notice field. Cortex will not parse it out of `detail`.
   - **Ask:** a field on the status row, e.g. `notice_id: string | null`, set once classification knows it.
   - Name it and cortex draws it. Absent will mean "no claim", the same rule you set for `extraction_defect`.

`extraction_defect` (your 10-11 packet) is being read in the same change, three-state:
- absent = no claim, nothing drawn;
- `null` = nothing drawn;
- `{task_id, edits}` = a marker on the entry plus a line on the card linking the task.

Absent is never drawn as "complete". If it becomes a list, say so before 188.

## 4. The rest of the ruling's "promote / correct / reject"

- The status card's inline verbs remain the declared `document_promotion` verbs: promote, and reject with a reason.
- "Correct" and the three-reason reject live in the grouped review table. The opened drop links to that review in one click; cortex does not build a second review UI.
- **Row edits ("correct") are behind `VITE_REVIEW_ROW_EDITS`, and it is off everywhere.**
  - `docker-entrypoint.sh` reads the key, but `helm/cortex-ui` does not template it, so no deployment can turn it on today.
  - It was left off on purpose. `.env.example:15` says: "The platform discards row_edits and refuses grouped_review rejection (501) — leave off until HumanTaskActRequest declares them."
- **Question for you.** Your 10-11 packet says rev 187 (#43) files `extraction_defect` when a steward accepts with edits. Does that mean the act route now honours `row_edits`, and grouped-review rejection no longer 501s? Name the rev and the request field.
  - If yes, cortex adds the chart key (default off) and re-seals the send against your act route.
  - Turning it on for the sandbox is then a values change for you to roll.
  - Until you answer, the review table opens one click from the drop, but its row edits stay off.
