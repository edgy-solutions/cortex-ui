# 2026-11-05: obsolescence's two cards wait on Lane 1's verb, and the case card has nothing maintenance-specific

**Dispatch (the architect, via Chris):** ADR-0065 / ADR-0066 (provisional numbers) cover obsolescence as a process and contracts as data. The standing rule applies: kinds, workflows, options, levels, slices, mappings and contracts are rows or files a deployment supplies. This queues behind 0.4.80, the finance live leg, the OpenDDIL walk and Socratic.

For cortex: two cards, both drawn from served declarations.

1. An **impact card**, a where-used table with population and stock, grouped by program.
2. The **resolution case panel**, covering options and approvals. It is the same card as the maintenance case, so "confirm nothing is maintenance-specific in it, and fix if it is."

"No work until Lane 1 serves the verb."

## Gate: not met, no code

No placed packet in either repo mentions ADR-0065/0066, obsolescence or where-used. The newest invincible-agent packets are dated 2026-11-06 (0.4.80 rolled, EV live leg open), and none of them carries a verb.

## The confirm: `src/archetypes/workflow-case/`, read-only

**Result: the card has nothing maintenance-specific. There is nothing to fix.**

| Checked | What the code does |
|---|---|
| Options (`caseOptions.ts`) | It uses `payload.options` when the key is sent; an empty array is respected, not replaced by a fallback. Otherwise it uses the pending task's own `payload.options`, and failing that, the declaration's `accepts` in declaration order. With no declaration, it offers no actions and says so. |
| Option labels (`lib/taskDeclaration.ts` `verbLabel`) | It turns underscores into spaces and capitalises the first letter, nothing more. No verb has a hand-written name. |
| Approvals (`contract.ts`) | `status: "pending" \| "decided"` is the contract's own two states. The approver and the decision come from the payload. |
| Stages / steps | They are read from `definition.domain_stages` / `steps`. |
| Domain-noun census of the code lines in Card, contract, caseOptions, row and index | It matched nothing. The search covered maint, fault, aircraft, tail, part, repair, MRO, work order, defer, inspect, fleet, ATA, NSN, engine, hazard, FRACAS and obsolesc. The only hits were `preventDefault`, `component` and `defineArchetype`. |
| Literal comparisons in Card | They cover the artifact pane's own load states, keyboard keys, `resolved.source`, and `approval.status === "decided"`. No workflow, kind, verb or role appears among them. |

**The one maintenance-specific file is not the card.** `fromMaintenanceBridge.ts` maps the `maintenance_bridge` wire into a `WorkflowCasePayload`, and it hard-codes `workflow_definition_id === "maint_fault_propose"` to attach a transcribed definition. Its non-comment callers are fixtures and tests only (`fixtures/index.ts`, `fromMaintenanceBridge.test.tsx`, `rawFields.test.ts`). No runtime path reaches it. Its own header calls it a stopgap until Lane 1's `/cases` route is served. A resolution case drawn from a served payload never passes through it. I haven't changed it, because the order said no work.

## What the gate will need (not started)

- **Resolution case:** `row.ts` is cortex-declared with `passthrough: []`, because "no producer route serves a case today". Once Lane 1 serves the verb, the producer tuple goes in `row.ts` verbatim, and a producer-mirror arm goes in `projectedTupleParity.test.ts`. Its own comment says so.
- **Impact card:** none exists. "Grouped by program" will group by a key the declaration names, never the literal `program` (config names the case). Population and stock are counts, so I'll ask whether they are completeness-bearing (`total_available`) before the card treats either one as a total.
