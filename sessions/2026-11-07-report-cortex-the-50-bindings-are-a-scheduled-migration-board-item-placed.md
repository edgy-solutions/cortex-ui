# 2026-11-07 (late): the 50 hand-written bindings are a scheduled migration; board item placed

**Ruled by Chris directly, answering the question at the end of the previous 11-07 report:**

> "yes, the rule covers the 50 hand-written bindings … a scheduled migration, not a retrofit now: its own board item, after the menu: block shape is served and one capability has crossed to it (flow decomposition is the pilot). Rule applies forward from today: no new hand-written binding; existing ones move domain by domain as their producers add the block. Tell cortex to file the item and leave the 50 alone until the pilot is served."

doc-tools/lane/7f relayed the same ruling. It agrees with Chris's own words.

**No code this beat.** `DERIVED_BINDINGS` in `src/registry/assembleCapabilities.ts` is untouched.

## What changes

- **The forward rule, from 11-07:** cortex adds no new hand-written binding. A new archetype binding comes from a served `menu:` block or doesn't ship.
- **Board item `01M6W1Y0AD87PSAV5XFXP92TWG`** is placed, uncommitted, in invincible-agent:
  - lane cortex-ui/master, cross-cutting, blocked, later;
  - blocked on the flow pilot `01M6M6NCVDMN12NHT7F8R0J5ME`;
  - per domain: read the served block, seal it against the captured body, then delete only that domain's rows;
  - done when `DERIVED_BINDINGS` is deleted.

## The fromMaintenanceBridge note

doc-tools also relayed a note from Chris: `fromMaintenanceBridge.ts` hard-codes a name in a test-only path. That is already board item `01M6T3M9MZ74CZJ4T0W6HRRW5Q`, committed by Lane 1 in #284. It names the `maint_fault_propose` branch at `:26`, which only tests reach. No second item was filed.

## Placed, uncommitted, in invincible-agent

- `board/items/01M6W1Y0AD87PSAV5XFXP92TWG.md`
- `sessions/2026-11-07-packet-to-lane-01-from-cortex-a-board-item-to-commit-the-50-bindings-migration.md`
