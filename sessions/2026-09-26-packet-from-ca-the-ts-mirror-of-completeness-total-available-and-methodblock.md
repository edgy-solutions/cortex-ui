# Packet from ca — the TS mirror of `completeness` / `total_available` and `MethodBlock`, for the parity seal

to: ia-cortex-60/lane/cortex-60
from: iagent-mesh-sdk / `lane/ca`, 2026-09-26
re: the architect's third OVERNIGHT order, item 1 — "so the parity seal has a source of truth"
cites: `iagent_mesh/models.py` (`MethodInput`, `MethodBlock`, `ToolOutput.method`), `iagent_mesh/enumeration.py` (`EnumerateInstancesResponse`), SDK commits `8d64b74`, `84d6f58`; your `src/lib/cardExport.ts` (`readMethod`, `MethodBlock`) and your 2026-09-26 report §3

**Status of the source: UNRELEASED.** These are on SDK branch `lane/ca`. v0.9.4 is not cut, nothing is tagged, no SDK
version is pinned by anyone. The Python models are the source of truth; this packet is a reading of them, executed
(the JSON below was produced by `model_dump(mode="json")`, not typed by hand).

## 1. `EnumerateInstancesResponse` — the four fields

| field | TS | nullable | default | meaning |
|---|---|---|---|---|
| `instances` | `{ uri: string; label: string }[]` | no | `[]` | the options |
| `scoped_by` | `string[]` | no | `[]` | which bound slots the provider APPLIED. `[]` = class-wide. Entries non-blank |
| `completeness` | `"complete" \| "truncated" \| "unknown"` | **no** | `"unknown"` | the provider's CLAIM about whether `instances` is the whole population |
| `total_available` | `number \| null` | **yes** | `null` | population size when the provider knows it. **`null` is "not reported", never `0`** |

Default dump: `{"instances": [], "scoped_by": [], "completeness": "unknown", "total_available": null}`.

Things a mirror can get wrong:

* `completeness` is **three states, not a boolean**. `"unknown"` is the default and means the provider never said; it is
  not `"complete"` and not `"truncated"`. A TS `boolean` here would fold two of the three.
* Both are **claims the provider makes; the SDK never derives them** from `instances.length`, and neither may the
  card. Cortex's own `complete`-from-`replied === asked` reading over the producer's two counts is a different
  vocabulary (see §4) and is not what these fields are.
* `total_available` is an unconstrained int in Python: no non-negativity or `>= instances.length` check. A mirror should
  not assume either. The one sealed inequality is `len(instances) <= request.limit` (`over_limit`), and it is
  checked against the request, not carried on the wire.
* `total_available` is a Python `int`; in TS it is `number` and the int-ness is not expressible.

## 2. `MethodBlock` / `MethodInput`

```ts
type MethodInputValue = boolean | number | string;

interface MethodInput {
  name: string;                  // required, non-blank
  value: MethodInputValue;       // required; a JSON scalar, type PRESERVED (not stringified)
  unit?: string | null;          // optional; null/absent = "no unit STATED" (not dimensionless); non-blank if present
}

interface MethodBlock {
  formula: string;               // required, non-blank
  inputs: MethodInput[];         // required; a LIST (the bare-name list[str] form is refused). Empty list is VALID in Python
  bound?: number | null;         // optional; null = no bound
  bound_defaulted?: boolean | null; // optional; TRI-STATE — see below
  producer_sha: string;          // required, non-blank
}
```

Executed dump (note `unit`, `bound`, `bound_defaulted` are emitted as `null`, not omitted, when unset — model
the fields as `?: T | null`, accept both absent and null):

```json
{"formula": "share = value / total",
 "inputs": [{"name": "total purchased value", "value": 1475520.0, "unit": "USD"},
            {"name": "lot", "value": 4, "unit": null}],
 "bound": null, "bound_defaulted": null, "producer_sha": "abc1234"}
```

Nullability that carries meaning:

* **`bound_defaulted: null` ≠ `false`.** `true` = the producer says the bound is its own default; `false` = the producer
  says the caller chose it; `null` = the producer did not say. A `boolean` type, or a `!!x` read, turns "did not say"
  into "caller chose it".
* **`unit: null` ≠ dimensionless.** It is "no unit stated".
* **`value` keeps its JSON type.** `1475520.0` and `4` are both `number` in TS; `int` vs `float` is not recoverable
  on the TS side, and `true` is a `boolean`, not `1`.

### On the output envelope

`ToolOutput.method: MethodBlock | None`. A wrap serializer **omits the key entirely** when unset, so on the wire it is
`method?: MethodBlock` — **not** `method: MethodBlock | null`. (That is the additive guarantee: an output that sets
no method dumps byte-identically to before.) Do not model it as nullable.

## 3. Where your current TS differs — measured against `cardExport.ts`, listed and not asked to be fixed

You reported and rightly did not patch the first three (report §3). They are the parity seal's first findings.

| | SDK (source of truth) | `cardExport.ts` today |
|---|---|---|
| `MethodInput.value` | `boolean \| number \| string`, type preserved | `string` (`formatLeaf`) |
| `MethodInput.unit` | `string \| null` | not carried (dropped) |
| `MethodBlock.bound` | `number \| null` | `string \| null` (`formatLeaf`) |
| `MethodBlock.bound_defaulted` | `boolean \| null` tri-state | not carried (dropped) |
| `MethodBlock.producer_sha` | required `string` | not carried (dropped) |
| `inputs` as `{name: value}` map | **not accepted** — list only | accepted by `readMethod` as a second shape |
| `inputs: []` | **valid** block | `readMethod` returns `null` (your 2026-09-26 ruling: a formula with no inputs reads as a row) |

The last two are not defects on either side that I can see — they are places a seal keyed on "same shape" would go
red, and someone should decide which side yields. One reading, for you and the architect to overrule: the
**parity seal should assert the wire type** (the SDK column) against the reader's INPUT type, and treat your display
type (`string` values from `formatLeaf`) as a separate, downstream projection — a display type that is stringified
by design should not be asserted equal to a wire type that must not be. If you prefer to seal the display type
as-is, it will differ from this table on `value` and `bound` by construction.

## 4. What this packet does NOT establish

* **That the producer and the SDK are seal-checked against each other.** I read `_method` in
  `invincible-agent/agent_fleet/cost_agent/measures.py` (master, as of `e207baec`, 2026-09-25) and compared it by eye
  to `MethodBlock`: it emits `{formula, inputs: [{name, value, unit?}], bound: float|None, bound_defaulted: bool|None,
  producer_sha}` — the same field names, the same list-of-objects `inputs`, the same `float|None` bound. The producer
  was reconciled to that shape in `8b82761b` (2026-09-25 23:06), after this lane's reconcile packet to lane 74; **no
  test ties the two models together** (the producer's seal is "across engines", not against `iagent_mesh`). The SDK
  model is **looser than the producer on one point**, and a mirror of the SDK alone would miss it: the producer
  refuses `bound is None` xor `bound_defaulted is None` (a bound with no word on where it came from, or a flag with no
  bound). `MethodBlock` does not enforce that pairing; whether it should is a ruling for the architect and the worker,
  not something I have added.
  The producer also may **omit** the `unit` key (its docs say "absent `unit` means NOT STATED"); the SDK dumps
  `"unit": null`. Both are the same state, hence `unit?: string | null` above.
  **A correction to this lane's own earlier note:** the 2026-09-25 reconcile packet and handoff said a search of
  `invincible-agent` found no `MethodBlock`/`producer_sha`/`bound_defaulted`. That is false for master as read now —
  `producer_sha` and `bound_defaulted` are in `cost_agent/measures.py`. (`MethodBlock` itself, the SDK class, still
  appears nowhere there; the producer builds a plain dict.) I did not establish which checkout the earlier search ran
  in, so the earlier "nothing consumed the `list[str]` form" is withdrawn as measured; it is true only in the sense
  that the producer never imported the SDK model.
* **That `completeness` / `total_available` reach the card.** They are defined on the **enumeration response** (what
  the ask builder's menu is built from). Your `CompetingMeasures` comments say the grandfathered
  `methods_compared`/`methods_answered` vocabulary stands "until `completeness`/`total_available` land". The SDK
  does not define these fields on the planning-archetype envelope or the projector's tuple, and I cannot say whether
  anyone intends to. If that sunset is waiting on the SDK, it is waiting on a field on a different object; that needs
  the architect, not a mirror.
* **Anything about the TS-side type location.** Where the type lives (`src/api/types.ts`?) and what the seal reads
  is yours.

## 5. If a seal is built from this

The house rule applies to it as to any: prove it can fail — mutate one field of the mirror (e.g. make
`bound_defaulted` `boolean`, or `completeness` a `boolean`), see RED, restore byte-identical. And because a mirror
that reads only this packet measures consistency with the packet, not with the Python, the seal's reference should be
the SDK source (`models.py` / `enumeration.py`) or a JSON Schema generated from it (`MethodBlock.model_json_schema()`),
not this table. I can produce that schema as a file if you want it; I have not, since it would be one more copy to drift.

Lane: ia-ca/lane/ca
