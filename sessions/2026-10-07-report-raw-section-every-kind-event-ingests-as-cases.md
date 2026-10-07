# Report: the raw section for every kind, event ingests drawn as cases, inject-env.sh deleted; DELTA_SET parked

from: cortex-ui/master · 2026-10-07
orders (the human, verbatim): "Seal DELTA_SET on Lane 1's lot 3 capture when it lands. Event ingests render as cases in WORKFLOW_CASE. The 48 maintenance-bridge fields: render what renders_as declares, the rest in a collapsible raw section; that's the ADR-0055 rule for every kind. Delete bin/inject-env.sh."

## Commits

| sha | what | image |
|---|---|---|
| `2aea705` | deleted bin/inject-env.sh; comments and CLAUDE.md name docker-entrypoint.sh as the only injector | `sha256:7a0c3471117bc3aae97a425892633deafcc387f92804828510ad07b7c093abbd` |
| `7a40378` | the raw section (detail below) | not built: only the HEAD of a push is built |
| `8935e6a` | event ingests drawn as cases, PRODUCER_REF → `3e6d9e9f` | `sha256:c054ba50f22e36f1389ba996e22625168869ee341889f2841ac0d99215c7fef6` (run 37642126310, 34 steps, 0 skipped; controls short/fake 404, known-good 200). **The current pin.** |

## 1. The raw section: draw what is declared, put every other key in one closed `<details>`

**What draws, and what goes raw.**
- A packaged archetype draws its `reads` plus `row.payload_key`. An unpackaged one draws its contract's `fields`.
- Everything else goes in the raw section. That excludes STRUCTURAL keys and `INTERPRETER_READS` (`source_persona` everywhere; `valid_as_of`/`state_version` on CONTRIBUTION_RANKING). A test checks that list against the interpreter's source text.
- **Mounted once,** at SemanticInterpreter's dispatch. Reach is proved with a `zz_probe` key on the package, switch and fallback branches.

**No declaration.** APPROVAL_TASK, INSTANCES_BY_PROPERTY, SOURCE_LEDGER, TRIAGE_TASK and WORKFLOW_OBSERVATION have no package and no contract, so they show no raw section. Nothing was invented.

**The maintenance bridge.** Its undrawn paths ride as `bridge.<census path>` keys; an array path carries the whole array of that leaf. The census arm counts them from each fixture, not from a typed 48.

**The doctrine.** The "IT NEVER RENDERS" header in `unconsumedFields.ts` is rewritten:
- The formatter reason is answered by drawing values raw.
- The classification reason is a **producer obligation**. That obligation is placed with Lane 1 for the ADR-0055 amendment.

**What is raw on live captures:**
- COMPETING_MEASURES (eac-comparison, eac-roll-7): `lowest_eac`, `highest_eac`, `verdict`, `subject_concept`. The card deliberately does not take them; `index.ts` L6 says so.
- CONTRIBUTION_RANKING (lot 4): `subject_concept`. Traced: KNOWLEDGE_DOCUMENT draws it and declares it, while the other two cards are never handed it. No declared set was wrong.

**Baselines.** 3 of 30 entries changed. All 30 equal the old entry byte-for-byte once the `<details>` block is stripped.

**Mutants.** W1–W7 all went red, each in the seal that was meant to catch it, plus W7b, which renames the interpreter's read.

## 2. Event ingests drawn as cases

- **Kinds and status.** `INGEST_KINDS` is [pdf, cad, event]. `case_opened` is out-of-band, and the event ladder is `received → case_opened`. `case_id` is string | null; other types refuse the row.
- **Fetching.** `fetchCase` is a new declared transport site (10 sites; the redproof passes). It is sealed with fetch stubbed at the HTTP level for 200 valid, 200 invalid, 404, 503 and 500.
- **The card** draws through SemanticInterpreter, so a case also gets the raw section. A census forbids importing the Card directly.
  - 404 draws one sentence for absent-or-not-entitled.
  - A null case_id draws `no_case_id` and does not fetch.
  - pdf/cad rows never fetch.
- **The pin** moves to `3e6d9e9f`. The gateway diff `a0c2ba18..3e6d9e9f` was measured against what the producer seals read: nothing they read changed, so the local green measures the pin. `ingest_status.py` is unchanged.
- **Mutants.** E1–E6 all went red.
- **Not sealed against the wire.** The 200 body is producer-test-derived; the live capture is asked of Lane 1.

## 3. Two seals caught the combined tree, and both were fixed before commit

- **`noNodeBuiltinsInTheBundle`.** The new parity testkits imported `node:fs`. The guard's "not a .test file ⇒ ships" default is correct, so the testkits now take an injected reader instead. A planted `node:fs` import turns the guard red again.
- **askFold "threaded not fetched".** The new `<SemanticInterpreter>` in IngestStatusCard had no `artifactId`. The ingest panel is not a canvas artifact, so it is now passed as `artifactId={undefined}`, with the reason beside it.
- Each implementer ran only its own slice, so neither saw these. Only the full suite over both did.

## 4. Gates on `8935e6a`

- check:transport, redproof, `tsc --noEmit` and build:bundle all exit 0.
- vitest: 170 files passed and 2 failed, all local-only:
  - **taskKindParity "two, they AGREE"**: already known as local-only.
  - **meshSdkParity "the pin names a RELEASE"**: the local SDK disk's HEAD `e973968` was tagged **v0.9.8 at 09:53 today**, byte-identical on the mirrored sources. At the pin `ceab07a`, `describe` answers v0.9.5, which is what CI checks out. `ls-remote` does not show v0.9.8 on the remote, so it cannot be pinned yet.
  - **Action:** bump `meshSdkParity.json` provenance once v0.9.8 is pushed (the `e347d92` shape).

## 5. Parked, not done

- **DELTA_SET.** No lot 3 capture carrying it has landed; the only lot 3 file is the roll-7 refusal. Asked again in the packet.
- **The promote payload** is still 3 keys at producer `e2207468` (gateway.py L9245). Asked again.

## 6. Held for the human: placed packets committed as placed, NOT acted on

- **`2026-10-07-packet-to-cortex-60-three-more-claude-md-rules.md`** (ia-gov): it proposes CLAUDE.md rules. CLAUDE.md was not edited on a packet's word.
- **`2026-10-07-packet-to-cortex-60-the-method-label-reader-is-the-last-half-and-it-is-refusing-live-cards.md`** (ia-fin): cortex reads `method` where engine-fin emits `method_label`. The roll-7 competing-measures card is refused live. Not in today's orders.

Packet out: `2026-10-07-packet-to-lane-1-raw-section-rule-cases-drawn-four-asks.md`.
