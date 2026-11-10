# 2026-11-10: 0.4.83 pins db45763; the dropper hold reads the served attestation

**Dispatch (pasted, from the architect via Chris):** "attestation is served, the card stops deciding (0.4.83) …
delete the local logic in src/lib/dropperHold.ts and read the served field … Regenerate types at #324's sha; a test
against the producer that the card and the route read the same field. Name the resulting commit with its image and
gate as the 0.4.83 pin (replacing ece163b)."

This supersedes the earlier "0.4.83 pins ece163b; the #303 regen waits".

## The pin

| | |
|---|---|
| sha | `db45763a98f24b7d59e6bef51b6a817861de2956` |
| image | `sha256:b320303cd5b31f0766de8f00fab7b95090dd9ef8c5d4e7607cb08b8d22a64f52` |
| CI | Build Containers run 42743511504, success, all image steps ran |
| producer | `de1873c23faa45f098db6cfdab2beec0aa2f64ce` (#324, ingest 1.9.0) |

- **The digest** was read from GHCR with the full sha. Negative control `53caff9` gives 404. Positive control
  `01fa313` gives 200, `sha256:2b625433…`.
- **The gate (g84b)** ran on git-archive exports: cortex at the committed tree, invincible-agent at `de1873c2`.
  - 317 files: 4811 passed, 1 expected fail, 1 skipped, 9 todo.
  - Transport, redproof, test, tsc, seals and bundle all 0.
  - Report mtime 20:31:11.
- **The disk sibling is stale and gives a false red.** It is on `b4b41ad1`, which lacks e77883aa, so a local run
  against it fails the MULTI_SERIES parity. Gate only against the export.
- **The #303 regen is in this pin,** because #324's sha comes after #303.

## What changed

- **`dropperHold.ts`.** `attestationHold(payload, viewer)` reads `payload.attestation.excluded`:
  - absent or null: no hold;
  - malformed: `attestation-unreadable`, fail closed per Lane 1's 11-10 packet;
  - viewer listed: `dropper`.
  - Nothing is derived from `dropped_by`, and `mode` is not read.
- **The card.** It has a new hold reason and text for an unreadable block.
- **`useTaskAct`.** A structural 403 with a message shows the server's text inline.
- **The generator.** `DECLARED_SPLITS` names the `error` split (AuthorizationUnavailableDetail vs
  StructuralRefusalDetail). It throws on a third schema, or if the two copies come to agree.
- **MULTI_SERIES.** The passthrough gains `data_provenance`. It is not drawn.
- **The producer seal.** `dropperHold.producerSeal.test.ts` checks the stamp, the served list and the route
  condition, and that the 403 code is structural.
  - It also carries an `it.fails` tripwire: the route does not read `excluded` itself. It recomputes the same set
    from `dropped_by`.
  - So the card and the route read the same set, not the same field. The one-line route change is asked of Lane 1.
- **Mutants.** 16 mutants, each reddening its intended arm with the intended message:
  - generator 3;
  - hold 4;
  - card 2;
  - 403: 2;
  - producer 5 (on the export copy, which was verified byte-identical afterwards).

## Open

- The route reading `block["excluded"]`. It belongs to Lane 1, and the tripwire flips when it lands.
- `attestation` is not declared in the 1.9.0 openapi. The question is asked of Lane 1.
- One reading of malformed blocks: the architect's wording would leave Promote enabled; Lane 1 says hold. We hold.
  Flagged in the packet.
- Gov's row choice. Lane 1's packet to gov proposes `viewer_may_attest`, which is not served. Cortex reads
  `{mode, excluded}`.

## Packets

- Placed, uncommitted, in invincible-agent/sessions:
  `2026-11-10-packet-to-lane-01-cc-architect-gov-from-cortex-0-4-83-pin-is-db45763-the-hold-reads-attestation-excluded.md`
- Lane 1's 11-10 attestation packet was committed with the work. The other untracked `sessions/` packets are left as
  they were.

worktrees: under wt\<lane>\ (0 moved, 0 pruned, 0 under %TEMP%). `git worktree list` shows only the main checkout.
The gate roots in the session scratchpad are `git archive` exports, not worktrees.
