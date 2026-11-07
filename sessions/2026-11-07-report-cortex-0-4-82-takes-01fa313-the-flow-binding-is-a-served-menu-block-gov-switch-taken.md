# 2026-11-07 (later): 0.4.82 takes `01fa313`, the flow binding is a served `menu:` block, and gov's switch is taken (waiting on #290)

**Dispatch (the architect, via Chris, pasted by Chris):**

1. "Binding: a generic class, `mesh:FlowDecomposition`, sibling of mesh:MultiSeries … Order: Lane 1 adds the class (0.4.82) → the measure's overlay row declares its `menu:` block (fin) → projector row (Lane 1) → menu reads it (cortex). No menu constant anywhere."
2. "0.4.82 takes 01fa313."
3. "take gov's switch: canExportBatch reads `ingest:exportBatch` from capabilities once #290 is on master. Capability, never group, is the rule."

**No code this beat.** Every cortex step is gated: (1) is last in its order, and (3) waits on #290.

## 1. The flow binding

- Cortex's step is fourth, after the class, fin's `menu:` block and Lane 1's projector row.
- The hand-written `assembleCapabilities` row that cortex sketched in the earlier 11-07 packet is withdrawn.
- **The reader doesn't exist yet on either side.** Cortex reads served task-kind declarations (`src/api/client.ts:987`), while capability bindings are hand-written (`DERIVED_BINDINGS`). invincible-agent `3949ade8` has no `menu:` block in any overlay.
- The packet asks fin and Lane 1 for the block's fields, the route it's served on, whether it is per caller, and one captured example to seal against.

## 2. 0.4.82

Lane 1 is told to pin `01fa3134…` at `sha256:2b625433582820a489303dc7dfebc8e1526e0af7ba55a4a768d32637a9c13adb`, replacing `0dc5366`. Not `795c6f4`, which is sessions-only.

## 3. gov's switch

**#290 is not on master.** At `3949ade8`, `ingest-v1.openapi.json` is 1.6.0 with no `"capabilities"` (control: `"groups"`, 3 hits). `lane/gov-me-entitlements-capabilities` `097630f6` has the field and is not an ancestor of master.

**Once it merges, cortex will:**

1. regenerate `ingestV1.ts`/`bff.ts`;
2. change `canExportBatch` (`src/lib/reviewExport.ts:71`, today `g.includes(AP_GROUP)`) to read `capabilities.includes("ingest:exportBatch")`;
3. delete `AP_GROUP` (`:30`) and its GAP comment.

The callers to recheck are `reviewExport.test.ts` and `reviewExportSource.ts`.

## Placed, uncommitted, in invincible-agent/sessions

- `2026-11-07-packet-to-lane-01-cc-fin-architect-from-cortex-0-4-82-takes-01fa313-and-the-flow-binding-order.md`
- `2026-11-07-packet-to-gov-cc-lane-01-architect-from-cortex-the-canexportbatch-switch-is-taken-waits-for-290-on-master.md`

## For Chris

**"No menu constant anywhere" reaches beyond the flow card.** `src/registry/assembleCapabilities.ts` holds 50 hand-written bindings. Each pairs a subject and an archetype class and names its `persona_fit`/`domain_fit` (10 DATA_ENGINEERING, 9 SUSTAINMENT, 9 PORTFOLIO_PLANNING, 8 PROGRAM_FINANCE, 8 PRODUCTION_COST, 4 empty).

Does the ruling retire those as the served `menu:` block arrives, or does it cover only new bindings? I haven't touched them. If it's the former, it is a migration with its own board item, and it waits on the same block shape.
