# 2026-11-10: the 0.4.84 candidate is 8e32f5b; the seal reads the route's served list, and the footer labels each number

**Dispatch (Chris):** "cortex: fix the two seal tests #325 will trip at re-pin; the answer footer shows wall clock,
hops and artifacts as separate labelled numbers (served fields to follow from perf)."

**Then:** "#325 is on master at 4f2dac35. Do your four steps against that sha. 0.4.83 keeps db45763, which already
reads excluded; the regenerated commit is the 0.4.84 pin candidate, named with its image and gate."

**Footer answers (Chris, asked this beat):**
- The summed time stays, labelled `work`.
- `wall clock` and `hops` are omitted until served.

## The candidate

| | |
|---|---|
| sha | `8e32f5bd4db8e0f5686fe7a3b94dd507a7679c48` (on top of `5c45506`) |
| image | `sha256:8900f150623781d5e64e00fb6ebbc1b187eb2d446a4d44af0eb55c4a97426c85` |
| CI | Build Containers run 42876279566, success, all 29 Build Frontend steps succeeded (none skipped; "Build and push frontend image" ran) |
| producer | `4f2dac35fa108c6904e7762b2b9dc644e14be40d` (#325, ingest 1.9.1), in `build.yml` `PRODUCER_REF` |

- **0.4.83 is unchanged** and stays on `db45763`.
- **The digest** was read from GHCR with the full sha. Negative control `53caff9` gives 404; positive control
  `01fa313` gives 200, `sha256:2b625433…`.
- **The gate (g84d)** ran on git-archive exports: cortex at `8e32f5b`, invincible-agent at `4f2dac35`.
  - 318 files: 4825 passed, 1 skipped, 9 todo, and no expected fails.
  - Transport, redproof, test, tsc, seals and bundle all exit 0.
  - Report mtime 12:31:33. The instrument: 490 cross-repo arms ran, 0 did not.
- **The first gate (g84c, on `5c45506`) was red in 2 arms.** `questionChrome` and `formatDuration` read the
  panel's source for the old `took` spelling. My earlier run covered only `NeuralStream/`, so it missed them. Both
  now read the footer's spelling, and each was fired at with a mutant and reddened. That fix is `8e32f5b`.
- **The re-pin checks at `4f2dac35`.**
  - `de1873c2` is an ancestor.
  - #325 changes 7 files, none under task_kinds or review_shapes: the check-2 diff is EMPTY against a control of
    7 files.
  - `uv.lock` is unchanged, so iagent-mesh stays at v0.9.15.

## The four steps

1. **The types are regenerated at `4f2dac35`.**
   - Ingest-v1 1.9.1 adds `Attestation {mode: self|second_party, excluded: string[]}` (both required, closed) and
     `TaskPayload {attestation?}`.
   - `HumanTask.payload` is now `TaskPayload | null`.
2. **`PromotionAttestation` is now the generated `Attestation`,** no longer hand-written. A new arm, which needs no
   producer checkout, checks the snapshot: `TaskPayload.attestation` is an `Attestation`, and its `excluded` is a
   required string list.
3. **The tripwire is now an ordinary arm.** The route section must:
   - bind `<name> = block["excluded"]` (or `.get`);
   - take `mode = block["mode"]`;
   - refuse under an `if` that tests `mode == ATTESTATION_SECOND_PARTY` and `acted_by in <that name>`, with no
     `_excluded_attesters` or `self_attested` in the condition.

   The 403 code must still be a `StructuralRefusalDetail` code. Against `de1873c2` these arms are red (3 fail),
   with the messages "no PromotionRefused under an acted_by condition" and "the route does not read
   block["excluded"]".
4. **Mutants.** Every mutant reddened its intended arm with its intended message, and the files were restored
   byte-identical. On the export and the snapshot:

   | Ids | Mutation | Arm reddened |
   |---|---|---|
   | R1, R2 | the condition uses `self_attested` or `_excluded_attesters` | the refusal arm |
   | R3 | `excludes` | the binds arm |
   | R4 | the mode clause is dropped | the refusal arm |
   | R5, R6 | the code is `not_authorized_to_act`, or the status is 409 | the 403 arm |
   | R7 | the mode is recomputed | the refusal arm, mode |
   | R8 | `and self_attested` is appended | the refusal arm, "recomputed" |
   | S1 | the stamp key is `attestations` | the stamp arm |
   | W1 | the attestation is an untyped object | the wire arm |
   | W2 | `excluded` is not required | the wire arm |

   R1 reddens with "no PromotionRefused under an acted_by condition", not "recomputed". That is right for its
   spelling, because its condition has no `acted_by in` left. R8 carries the "recomputed" message.

## The footer

Perf's 11-08 census: "7m 35s · 4 hops" was four artifacts' summed work. It was neither a wall clock nor an engine
hop count.

- **`answerElapsed`** now returns `{ms, artifacts, measured}`; `hops` is renamed to `artifacts`.
- **`answerFooter(e, served)`** returns labelled numbers in this order: `work`, `wall clock`, `hops`,
  `artifacts`.
  - `work` is the sum, and says its coverage when partial: `work 4.4s (1 of 2 measured)`. It is absent when nothing
    was measured.
  - `wall clock` and `hops` come only from `ServedAnswerTiming`. Every caller passes `NOT_SERVED` today, so neither
    is drawn. A served value that is not a usable number is dropped like an absent one; zero hops is drawn.
  - `artifacts` is always drawn for a real artifact.
  - No artifact gives no footer.
- **Both rows draw `<AnswerFooter>`,** with `data-answer-footer`, a `data-footer-number=<key>` per number, and a
  `title` saying what each measures (`work` says "not a wall clock").
  - TimeRow moves the numbers from the 44px clock column to a line under the content.
  - ClusterRow appends them after the time. They stay `select-none`.
- **Tests.**
  - `answerElapsed.test.ts` has 19 arms, including served, absent, invalid and zero.
  - `AnswersPanel.footer.test.tsx` mounts both rows through the real panel (TIME and TOPIC modes).
- **Footer mutants.** Each reddened its intended arms:
  - F1, F2: either row's footer dropped;
  - F3: `hops` derived from the artifact count;
  - F4: the coverage dropped;
  - Q1: the footer made selectable;
  - Q2: ClusterRow's footer emptied.

## Open

- **Perf's served field names** for wall clock and hops. They are asked in the packet, and wiring them is one call
  per row.
- **A small divergence to flag.** The card ignores `mode`, while the route 503s (`attestation_undeclarable`) on a
  mode it does not know. A block with an unknown mode but a valid `excluded` leaves Promote enabled, and the act then
  fails 503. Asked in the packet whether the card should hold it as unreadable.

## Packets

- **Placed, uncommitted,** in invincible-agent/sessions:
  `2026-11-10-packet-to-lane-01-cc-architect-perf-from-cortex-0-4-84-candidate-8e32f5b-the-seal-reads-excluded-footer-labelled.md`
- **Committed with the work:** Lane 1's two 11-10 packets: the attestation one, with the architect's note, and "the
  route reads excluded, three seal arms move".
- The other untracked `sessions/` packets are left as they were.

worktrees: under wt\<lane>\ (0 moved, 0 pruned, 0 under %TEMP%). `git worktree list` shows only the main checkout.
The gate roots in the session scratchpad are `git archive` exports, not worktrees.
