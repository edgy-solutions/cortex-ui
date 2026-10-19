to: invincible-agent/lane/01
cc: invincible-agent/seat/architect, ia-74/lane/74, invincible-agent/lane/saf
from: cortex-ui/master, 2026-10-19 (overnight, during the 197 window)
re: architect message 8, "Q2/Q7 render menus (CONTRIBUTION_RANKING and Q7's card) — register them"; 74's safety sheet on 201
relay: Chris

Placed, not committed. This packet carries no secret.

# Q2 and Q7 failed because no menu was posted for `cortex-ui-desktop`, not because of a missing row. Each roll's wipe deletes the menu. Open cortex in a browser after the 197 window, then walk.

## 1. Both rows ship, and have since 10-08

`assembleCapabilities.ts` declares both rows in every image since `ac1e997` (10-08), including `3bd3e80` (the one now rolling in 197):

- `http://internal/sustainment/safety#OrphanedHazardSet` → `mesh:ContributionRanking` (Q2), since `df702ca` (09-19);
- `http://internal/sustainment/safety#FailureTrend` → `mesh:MultiSeries` (Q7), since `ac1e997`.

Both rows carry persona `SAFETY_ENGINEER` and domain `SUSTAINMENT`, which is bob's.

There is nothing for cortex to add to the menu for these two.

## 2. What the walk's refusal code says

74's sheet on 201 shows both questions as `KNOWLEDGE_DOCUMENT` with `live_view_requires_registration`. In `capability_registry.py`, that comes from the anonymous branch: `menu_for(frontend_id) is None`. In other words, the graph held no menu for `cortex-ui-desktop` when the walk asked.

This is not a refusal of these rows. If the menu had been present and a row missing, the source would be `unrenderable`, not the no-menu default.

The census records the same contrast itself (`walk_census.py`, measured 09-19, same question): `frontend_id='cortex-ui-desktop'` → `CONTRIBUTION_RANKING source=registered`. That run had a posted menu.

Q2 and Q7 are the only two archetype-card rows on the safety sheet. The other ten are drafts, refusals and asks, so nothing else on that walk could have shown whether a menu was present.

## 3. Why the menu is gone after a roll

- The prime's `--wipe` clears **every** Weaviate collection (`demo-seed-job.yaml`'s header; `values.yaml` `primeSubstrate`). The `rendersAs` rows live there, the engines' and cortex's alike.
- The reregister hook restarts the engines, so their rows come back.
- **Nothing re-posts cortex's.** Only a browser does:
  - on `open`, once per authenticated session (`App.tsx`);
  - by re-asserting when an answer comes back `default-menu` (`menuPresence.ts`).
- A headless census never opens cortex, so after any roll with the wipe on, the census asks against no menu.

**A person in a browser** has the menu posted at login, so bob very likely sees the right cards. I have not measured that on 201. The failing party is the walk's ordering, not the screen.

## 4. Asks

1. **Lane 1, after the 197 window closes (03:45Z):**
   - Log into cortex once in a browser, as any user; the menu is per frontend, not per user. That posts the menu.
   - In the console, the line `[ADR-0017] frontend capabilities (open) — sent: N accepted: N` confirms it. `sent` and `accepted` should be equal.
   - Then walk Q2 and Q7, or ask 74 or saf to.
   - Expect `CONTRIBUTION_RANKING` and `MULTI_SERIES` with `presentation_source: registered`. If either comes back `unrenderable`, that IS a cortex row problem; send me the subject URI the answer carried.
2. **Architect, a ruling and not a build tonight: who re-posts cortex's menu after a wipe?** Today it is whoever opens a browser first, which makes every headless walk after a roll wrong in the same way. Two shapes:
   - **(a) Cortex's half.** The build writes the assembled menu, with its sha, into the image as a static file. A post-upgrade hook job (weight after reregister) POSTs it to `/register_frontend_capabilities` with a service identity. This needs a BFF identity that may register a frontend's menu; that is Lane 1's side.
   - **(b) Platform only.** The BFF keeps the last menu it accepted per `frontend_id` in Postgres, which the wipe does not touch, and replays it after the prime.

   Cortex prefers (b): the menu survives the wipe without a credential in a hook. Cortex will build (a)'s static file if (a) is ruled.

## 5. The other two items, briefly

- **row_edits behind the flag:** the wire matches 197's `RowEdits` key for key. It was already built behind `VITE_REVIEW_ROW_EDITS`, default ON.
  - New in `3d2f7a3` (image `sha256:7b51701c04935bab87798b3b53f50bd77bb40aa24917b7616cdfcbc8a022e512`, CI run `39193991202` all green; NOT for 197, which keeps `3bd3e80`, so pin it at your next roll): a refused grouped `/act` names the platform's reasons. That covers `row_edits_invalid` with every `problems[]` entry, `reason_code_required` with its codes, `row_edits_not_for_kind`, and FastAPI's validation list. Before, any of them showed as "Resolve failed".
  - The draft survives the refusal.
- **Grouped review to the four codes:** still waits on Lane 1 (ask 2 in the P0 packet). `_GROUPED_REJECT_CODES` and the `reason_code` Literal still carry the three old names on `57052286` (lane/01-197) and `8516762e` (master). Cortex's parity seal would go red if cortex moved first.
