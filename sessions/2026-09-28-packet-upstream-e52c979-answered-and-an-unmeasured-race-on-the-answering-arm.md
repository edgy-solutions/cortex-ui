# Packet to `invincible-agent` — `e52c979` is answered, one thing `lineage_claim.py` names but does not measure, and cortex's producer pin has moved

**From:** cortex-ui (frontend lane), master
**Date:** 2026-09-28
**Cortex commits carrying this:** `4189488` (the consumer side), plus the pin bump below

---

## 0. The one line the platform needs

`PRODUCER_REF` in cortex's `build.yml` moved from **`1c1005c2`** to **`ec055c49`** (origin/master).
That is the sha cortex's CI now measures the producer at. If the platform rewrites or force-pushes
master, cortex's build is what breaks, and the error will name the pin.

---

## 1. Closed: cortex's `e52c979` question is answered by `d3944da8`

Nothing further is needed from the platform on this one. Recorded so it is not re-asked.

Cortex asked what a turn typed into the composer should do when it names an answering artifact — the
case that satisfies neither `bound_slots` nor `spoken_answer`. `d3944da8` ruled it, and did more than
rule it: it moved the rule out of `gateway.py` into `iagent_pure/lineage_claim.py`, where it can be
exercised rather than grepped for. Cortex now reads five outcomes rather than two:

    named + (pick or typed answer)        -> honoured
    named + prose + ask is the caller's   -> honoured   <- the new arm, and it pays a graph read
    named + prose + ask is NOT theirs     -> refused    (REFUSED_NOT_THE_CALLERS)
    named + neither + no prose            -> refused    (REFUSED_NOTHING_CARRIED)
    nothing named                         -> no claim, deliberately NOT a refusal

Cortex's `LineageClaimVerdict` gained `"ownership_decides"` for the composer turn, because the verdict
is no longer a property of the body cortex holds — it depends on a fact only the graph has. Saying
"refused" was wrong; saying "honoured" would have been a guess.

**One thing cortex deliberately did NOT widen.** `pre_resolved_route_allowed(answers_something=...)`
still takes the narrow predicate, and takes it as its only argument. Cortex read that as intentional
and mirrored it: an accepted claim draws an arrow, a pre-resolved route dispatches a verb against a
subject nobody re-confirmed this turn. **If that reading is wrong, cortex would like to know**, because
it is now written into a comment that future readers will trust.

---

## 2. OPEN — an unmeasured race on the answering arm, flagged not claimed

`lineage_claim.py` **names** a window on the newly-honoured arm: the honoured-by-ownership path
returns before the graph read that establishes ownership. Cortex is not claiming this is a defect —
cortex cannot see the transaction boundary from here, and the file may already rely on something that
closes it.

Cortex's pending-row ordering seal sits adjacent to exactly that window on the consumer side, and its
assumption is currently *unstated on both sides*. A symmetric non-claim reads as a draw, so cortex is
naming who can decide it rather than leaving it open.

**Three questions, each answerable in a line:**

1. Is the ownership read inside the same transaction as the claim's acceptance?
2. If not, what is the observable consequence of losing that race — a wrong verdict, or a retry?
3. Does anything on the platform side already assert either answer, or would cortex be the first?

---

## 3. A finding about CROSS-REPO SEALS that the platform may want, since it owns the other half

Cortex's CI went red on this work, and the way it went red is worth one paragraph.

Cortex re-aimed its seal at `iagent_pure/lineage_claim.py`. Locally: 1871/1871 green. In CI: one file
failed. The cause was cortex's own pin — `PRODUCER_REF` still pointed at `1c1005c2`, which predates
`d3944da8`, so CI measured a producer without the ruling while the developer's sibling checkout was
standing on one with it. Cortex's bug, cortex's fix, no action needed.

**But note WHICH arms caught it.** The four arms aimed directly at `lineage_claim.py` **skipped** —
the file does not exist at the old pin, so their existence gate silenced them. What failed were the
three *wiring* arms reading `gateway.py`, a file present at both shas, which could therefore actually
compare and disagree.

> An arm gated on a peer file's existence cannot report that the peer is too old to have that file.
> An arm reading a file that exists at every sha can.

Raising it because **the platform runs cross-repo seals in the other direction**, and any seal written
against a newly-extracted module has this shape by construction. Cortex's second line of defence (a
guard that fails the build when any cross-repo arm reports neither passed nor failed) held — it simply
never ran, because the suite step failed first.

---

## 4. Not in scope, listed so it is not lost

No action requested; flagged for whoever holds them.

- `sub_query` **and** `accepted_slots` on `_render_refusal_menu` / `_render_abstain_menu`, as a pair.
- Whether `completeness` / `total_available` ever reach the planning envelope. Cortex's mirror now pins
  SDK **v0.9.4**, which carries both, so the producer side of this is unblocked.
- Ruling 5's consumer half: `row.method` -> `method_label` in `CompetingMeasures`.
- Ruling 3 still needs arch.

---

## 5. What changed on cortex's side, for the record

| | |
|---|---|
| `src/api/answeringArtifact.ts` | `LineageClaimVerdict` gains `ownership_decides`; comment records the re-measurement and the route/arrow split |
| `src/api/lineageHonoured.test.ts` | re-aimed at `iagent_pure/lineage_claim.py`, rewritten to 22 arms |
| `src/hooks/useInterviewAgent.test.ts` | composer arm retitled, asserts `ownership_decides` |
| `.github/workflows/build.yml` | `PRODUCER_REF` `1c1005c2` -> `ec055c49` |

Diffed across that pin bump for **only** the files cortex's seals open: `gateway.py` (+124/-9) and
`lineage_claim.py` (new, +88) move; `human_tasks.py` and `defs/dynamic_supervisor.py` do not, so the
seals reading those are untouched.

Cortex's SDK mirror also moved from a lane-branch commit to release **v0.9.4**
(`c75587e96bbe9d93c192bd0dda2464c205001d51`). Unrelated to this packet, mentioned only so a reader
comparing mirrors is not surprised by the ref change.
