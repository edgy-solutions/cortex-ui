# Overnight item 3 — the TS mirror of `completeness` / `total_available` / `MethodBlock`

Order: *"TS SDK parity: completeness / total_available and MethodBlock typed in the TS SDK,
mirrored from iagent_mesh models with a cross-repo parity seal, so the two SDKs can't drift."*

Gate: `check:transport` 0 · `tsc --noEmit` 0 · **118 files / 1827 tests** · 30 mutants, 30 indicted.

## ⛔ First, a scope correction the order's wording hides

**Cortex cannot own "the TS SDK."** `baml_client_ts/public_api.ts` lives in `invincible-agent`,
which is read-only for this lane. What landed is **cortex's own half** — a mirror of the pydantic
models in the types cortex reads the wire through — plus the seal that ties it to the Python. That
is the same doctrine the platform already runs under in `tests/_method_block_contract.py`: *the
consumer is the source for its own half*. Nobody needs to reconcile two authorities; each side
seals its own reading against the shared source.

## What landed

| File | What it is |
|---|---|
| `src/api/meshSdkTypes.ts` | the mirror: `WireMethodInput`, `WireMethodBlock`, `WireToolOutput`, `WireInstanceOption`, `WireCompleteness`, `WireEnumerateInstancesResponse`, plus compile-time assertions and the `MIRRORED_FIELDS` descriptor |
| `scripts/extract-mesh-sdk-parity.mjs` | reads the field declarations out of `models.py` / `enumeration.py` |
| `scripts/extract-mesh-sdk-parity.d.mts` | its types, so the seal reads it as something other than `any` |
| `src/api/meshSdkParity.json` | the committed extraction, `lane/ca@b0abd3b`, with provenance |
| `src/api/meshSdkParity.test.ts` | the seal, 21 arms |

**The reference is the Python, not the packet.** Packet §5 says so itself: a seal built from the
packet's table measures consistency with the table. Hence an executable extractor.

**Why a snapshot exists at all:** CI checks out cortex alone, so a cross-repo-only seal would skip
in the one place that gates a merge. The snapshot is the always-running half; the live Python is an
`it.skipIf` half, the same idiom `boundSlots.test.ts` uses for the gateway. **That split is a real
gap and is named in the file rather than papered over** — closing it needs a CI job checking out
both repos, which is the architect's call.

**Wire type vs display type.** `cardExport.ts` already has a `MethodBlock`, stringified by design
and refusing empty inputs (ruled 2026-09-26). Sealing *that* against the Python would assert a
stringified type equals one that must not be. Per packet §3 the **wire** type is sealed; the
export's type is a downstream projection of it.

## What the work found — four things, and three of them were my own premises

### 1. The seal's own mapper had the bug, not the mirror
First run: `Union[bool, int, float, str]` came out `boolean | number | number | string`. `int` and
`float` both land on `number` and TS has one numeric type. The arm indicted the **mapper** — the
half nobody suspects, because it is the measuring instrument.

### 2. "UNRELEASED" was true in substance and unfalsifiable as written
I had the snapshot claim the SDK was unreleased and the arm assert it had no tags. **It has tags
through v0.9.3.** HEAD is 21 commits past it and `pyproject.toml` is unbumped. Rewritten to the
fact that is actually load-bearing: *no released version contains these fields.*

### 3. And then that arm was keyed on the wrong subject
Re-keyed on class names, it went red on `EnumerateInstancesResponse` — **which has existed for
releases.** What is unreleased is `completeness` and `total_available` *on* it. A class can sit
still while its fields drift underneath, so the arm now walks the **field set**, and names the two
the order named. (Also: at v0.9.3 `ToolOutput` is literally `pass` — so the extractor's
"zero fields means the parser broke" throw is right for a live read and wrong for a historical one.
That catch lives in the arm, not in the extractor.)

### 4. A mutant survived on a green baseline, and it was a hollow assertion
`_bound_defaulted_is_tri_state` read
`Exactly<NonNullable<X> | null | undefined, boolean | null | undefined>` — it **adds back the two
members it just stripped**, so it could only ever check the base type. `bound_defaulted: boolean`
passed it.

**The tell was the baseline.** On the first `tsc` mutant run the baseline was already red (a missing
`.d.mts`), so all six "failed" and all six looked indicted. Fixing the baseline flipped one to
SURVIVED. *A redproof that exits 1 for the wrong reason measures nothing* — and here it measured
nothing for exactly one arm out of six, which is the hard case, because five real verdicts made the
run look sound.

The fix is not a sixth hand-written assertion. Hand-picked assertions covered **6 fields of 15**;
`FlagsAgree<T, D>` now ties `optional` and `nullable` to the interface for **all 15**, so a field
added tomorrow is checked by construction. Seven mutants prove it reaches rows that previously had
no compile-time tie at all.

### And one survivor that was not a hole
Disabling the extractor's docstring tracking produced **byte-identical** output — the guard's defect
is inexpressible on today's SDK. Not a hole; a guard no current input reaches. Deleting it was the
other option and the wrong one (an unparsed docstring line enters the snapshot as a phantom field,
and the seal then reports drift forever against something that does not exist). So the mutant it was
*for* got written as four fixture arms, and it is now indicted.

## Two open questions for the architect, from packet §4

1. **`bound` / `bound_defaulted` XOR.** The producer pairs them; the SDK does not enforce it.
   Cortex mirrors what the SDK declares, so it currently accepts a combination the producer never
   sends. Whether that becomes a model-level constraint is a ruling.
2. **Do `completeness` / `total_available` ever reach the planning envelope?** The `CompetingMeasures`
   sunset waits on a field on a *different* object, so this cannot be decided here.

Neither blocks anything that landed.

## Not done

- **Nothing is pushed.** `c3a7ac4`, `e0a4a82`, `15552d0`, `b176a06` and this are local. Asked, no
  answer yet.
- The CI gap above (cortex-only checkout) is stated, not closed.
