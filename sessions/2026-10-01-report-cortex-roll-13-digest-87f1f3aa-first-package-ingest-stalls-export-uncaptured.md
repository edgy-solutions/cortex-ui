# Report — cortex-ui, roll #13: digest 87f1f3aa; first ADR-0055 package; ingest stalls at received; export still uncaptured

from: cortex-ui/master · 2026-10-01
dispatch: OVERNIGHT (cortex API), items 1–4

| Item | Outcome |
|---|---|
| 1. Ingest sealed on end-to-end captures | **Sealed on what exists** (`6596999`). Lane 1's rev-164 capture never left `received` in 603 s, and no promotion task named the drop. Upload and status hops are sealed. Promote response and label are `it.todo`. A progressed capture is asked for. |
| 2. Export | **No new capture, so the card export stays.** The last body is roll #11's `failed` / "No module named 'agent_fleet'". `610a491f` (deployed) should fix it, but nobody has posted since. Asked. |
| 3. ADR-0055 COMPETING_MEASURES package | **Done** (`1ba333d`). See below. |
| 4. Runtime flags + digest | Flags already shipped in `863c196`: `docker-entrypoint.sh` writes `VITE_FEATURES` to `window.__RUNTIME_CONFIG__`. **Digest `sha256:87f1f3aa0e6e8591b7a7f0232c16a443bf3ce00f69985a6236cf4006c064fec5`** from `659699955455d55723a7317eaa06282c0c4f5fca`. Run 36962357028, 34 steps, 0 skipped. Controls: short 404, fake 404, `0489d36` → `613b6c35`. amd64 + arm64. |

## Also shipped: `83aa2d0` — roll #12's /act refusals were drawn as "Action failed"

`e53dafc9` (deployed) answers a failed resume with:
- 502 `workflow_resume_failed`;
- 409 `task_unresumable`;
- 409 `task_already_resolved`.

Each comes with a `message`, and the row stays pending. These are now drawn inline, or marked resolved. Mutants A1–A3 each reddened their arm.

## ⛔ For Chris: HAZ-1003 cannot be completed on the deployed cortex

`d2e56047` never reads `/task_kinds`, so no reason field is ever drawn. Your reset row needs a reason for `accepted` and `rejected`, so every attempt is refused 422. **Bob should act after roll #13.** Nothing wrong is recorded meanwhile.

## The package (`1ba333d`)

- **Layout:** `src/archetypes/competing-measures/` holds `contract.ts`, `Card.tsx`, `fixtures/`, `row.ts` and `index.ts`. They were moved with `git mv`, and no shim is left at the old paths.
- **`defineArchetype`:** refuses by name on 6 rules.
- **`readDeclaredAbsences`:** subtree-scoped, per the collision rule.
- **Registry:** derived by `import.meta.glob`. Its source may name no id.
- **`SemanticInterpreter`:** dispatches through the package and passes exactly the 10 fields it passed before.
- **Parity:** 9 renders through the interpreter, made at `00eeb73` before the move (7 fixtures plus the 2 renderable EAC captures), are byte-identical after it. The other 2 capture files that mention the archetype are refusal logs with nothing to render.
- **The row mirrors the producer's tuple** at `main.py:771`, in order. The yaml it implies is in the packet. Landing `policy/archetypes/` is step 3, the architect's to assign.

**One mutant survived, and it is a limit, not a hole in a seal:** passing `...comp` whole instead of `pick(reads)` stays GREEN. The card destructures named props only, so no capture can tell the narrow pass from the wide one.

`isFullWidth()` (`SemanticInterpreter.tsx` ~920) still names the id literally, as a layout predicate. ArchetypeGlyph, answerDisplay and fallbackDisclosure remain hand-kept sites for this id. They are out of scope for a first extraction.

## Gates

- check:transport 0, tsc 0.
- vitest 2121/2130, 2 todo. The 7 reds:
  - 6 are 5s timeouts under parallel load (87/87 when run alone);
  - 1 is the known environmental taskKindParity "two, they AGREE".

## Files

- Commits: `1ba333d`, `83aa2d0`, `6596999`.
- Packet: `sessions/2026-10-01-packet-to-lane-1-digest-87f1f3aa-for-roll-13-haz-1003-must-wait-for-it.md`.
