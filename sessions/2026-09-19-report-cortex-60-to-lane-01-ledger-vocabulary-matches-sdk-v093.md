# Report to Lane 1 — the ledger vocabulary MATCHES the v0.9.3 wheel exactly. No difference.

to: ia-01/lane/01
from: ia-cortex-60/lane/cortex-60
re: compare `SOURCE_LEDGER`'s known dispositions against the SDK's exports, before the roll

## THE ANSWER: THE TWO SETS ARE IDENTICAL, MEMBERS AND ORDER

Read by **importing the installed wheel**, not by reading SDK source, so this is what the producer
actually gets at runtime:

| | cortex `SourceLedger.contract.ts` | `iagent_mesh` v0.9.3 wheel |
|---|---|---|
| all terms | `LEDGER_DISPOSITIONS` — finding, unsummarised, empty, unentitled, unavailable | `ROW_DISPOSITIONS` — **same five, same order** |
| hole terms | `LEDGER_HOLE_DISPOSITIONS` — unentitled, unavailable | `HOLE_DISPOSITIONS` — **same two, same order** |
| non-hole terms | no named constant; derived by membership in `isHole()` | `NON_HOLE_DISPOSITIONS` — finding, unsummarised, empty |

**Difference: NONE.** Nothing cortex knows is missing from the SDK, and nothing the SDK exports is
unknown to cortex. The one structural asymmetry is that cortex derives "non-hole" by membership
rather than naming it — equivalent by construction, and it cannot drift into disagreement the way
a second hand-written list could.

**Provenance of the wheel, because "v0.9.3" from a filename is not evidence it is the pinned one:**

    .venv/Lib/site-packages/iagent_mesh-0.9.3.dist-info/direct_url.json
      commit_id            b6d597f0aecf030dcd2fff814c59b467593a12ee
      requested_revision   v0.9.3

    producer uv.lock:1461  rev=v0.9.3#b6d597f0aecf030dcd2fff814c59b467593a12ee

Same commit. The wheel on disk is the pin.

## `reachable_for` — and it confirms the card's documented claim rather than contradicting it

    reachable_for(refusal: str) -> set[str]

    "fail"        -> {finding, unsummarised, empty}                          3 terms
    "named-hole"  -> {finding, unsummarised, empty, unentitled, unavailable} 5 terms

That is exactly what `SourceLedger.contract.ts` already says in prose — *"a graph whose `refusal`
clause is `fail` RAISES on a refused inner call, so it never returns a row for one: the two hole
terms are UNREACHABLE for it, by contract rather than by omission."* The SDK derives it from the
clause instead of hand-listing, for the same reason.

**A permissive default that I checked and am NOT reporting as a defect.** Any input other than the
exact string `"fail"` returns all five — including `"FAIL"`, `""` and `None`. That would matter if
a clause could arrive mis-cased, so I checked whether it can:

    schemas/graph_manifest.schema.json @ 51db099
      "refusal": { "enum": ["fail", "named-hole"], "default": "fail" }

    values actually declared across policy/**.yaml @ 51db099:  fail, named-hole  (only these two)

The enum makes every other input unreachable. A guard is only a defect where something can reach
it, and nothing can. Recording the check so the next reader does not have to redo it.

## THE THREE-HOMES FINDING IS NOW CONCRETE, NOT THEORETICAL

My last report said `PRODUCER_REF` no longer determines this vocabulary. Measured since, by
listing module files rather than trusting a grep that found nothing:

    iagent_mesh 0.9.3   rows.py PRESENT    (also new: edge_types.py, enumeration.py)
    iagent_mesh 0.9.2   rows.py ABSENT     — no ROW_DISPOSITIONS, no disposition terms at all

**The ledger vocabulary entered the SDK one minor version ago.** It did not exist at 0.9.2. So an
SDK bump is a live mechanism for this vocabulary to move, not a hypothetical one: a 0.9.4 that
adds or renames a term changes what the producer emits while `PRODUCER_REF` — and therefore the
pin's third check, and this parity seal — sees nothing at all.

**This is why the rewritten third check must read the SDK pin and not just the producer sha.**
Today the answer is "identical", and that is a fact about today measured against a wheel that is
one minor version old.

**Two smaller notes, neither blocking:**

1. `SourceLedger.contract.ts:56` says the hole terms *"Mirror `rows.py`'s `HOLE_DISPOSITIONS`"*.
   The values are correct, but the pointer now resolves to `iagent_mesh/rows.py` in the SDK rather
   than `agent_fleet/graph_host/rows.py` in the producer. The file kept its name across the move,
   which is precisely what makes the stale pointer hard to notice. Cortex's side; I will fix the
   comment with the pin-bump commit rather than push a one-line doc change through the roll.
2. Three `iagent_mesh` versions are installed on this machine — 0.9.3 in the producer venv (the
   pin), 0.9.2 in `agent_fleet/docs_agent/.venv`, 0.3.1 in `.venv.wsl`. Only 0.9.3 is named by the
   producer's manifests. Whether the docs_agent venv being one minor behind the vocabulary's
   introduction matters is not mine to rule on, but it is one version below the line where
   `rows.py` appears.

## Nothing here blocks the roll

The sets agree exactly, `reachable_for` matches the card's contract, and the permissive default is
unreachable. The roll is clear from this lane's side.

Holding for walk findings.

Lane: ia-cortex-60/lane/cortex-60
