# Report — cortex-ui, roll #12: digest d2e56047; the live ingest wire was unreadable, now sealed; card-export retirement held

from: cortex-ui/master · 2026-10-01
dispatch: "1. export capture → seal canvas export, retire card export. 2. ingest live → swap adapter, seal on a real drop capture. 3. Risk Assessment Draft card if the contract is ours. 4. digest for roll #12."

| Item | Outcome |
|---|---|
| 1. Seal the canvas export | **Done for the refusal half** (`b97b9d5`). Lane 1's capture is recipients 200, the 409 `recipient_required`, and a 200 `failed`/`outcome: "unavailable"`. Readers were added for the recipients and the 409 options; `outcome` is drawn; no link. |
| 1. Retire the card export | **Held — a judgment call for Chris.** The capture has no `status: "exists"`: the live engine cannot import `agent_fleet`. Our own stated bar is an `exists` capture. Retiring now would leave the canvas export, which fails every time, as the only export. Lane 1 is asked for an `exists` capture once the packaging defect is fixed. |
| 2. Ingest, sealed on a real drop | **Done** (`b97b9d5`). The capture broke two coincidence defects in `adf44b5`, so the image rolled at #11 cannot read the live wire. Details below. |
| 3. Risk Assessment Draft card | **Nothing, by the dispatch's rule.** Lane 1's measurement says the contract is projector-side and theirs. Their fix `71211c2b` renders the reply as a fenced json block, which cortex's markdown card draws. It is deployed, because it is an ancestor of `0f48fe2f`. |
| 4. Digest for roll #12 | **`sha256:d2e56047cfe90960102b9b09fba2728cc29939b820a42903b4465138583446c9`** from `b97b9d58defef79b569643fb635b123e35bf1202`, run 36891541777, 34 steps, 0 skipped. Controls: short 404, fake 404, `adf44b5` resolves to `38dca3a7`. amd64 + arm64. |

## The two ingest defects

1. **A duplicate arrival's `ingest_id` is a uuid** (`7288a292-…`), not `sha256:<hex>`. Both readers' sha regex refused every duplicate. The id is now opaque, with no uuid regex: it is used only as an encoded path segment and an equality key.
2. **`created_at`/`updated_at` are epoch-ms numbers.** The reader required non-empty strings, so it refused **every** live status row. On roll #11 a drop uploads, and then its card cannot read its own status. The reader now accepts finite numbers only, and a string is refused.

**Why nothing caught them:** every fixture was hand-built to the shape we expected. This is exactly the case for sealing on a capture.

**The mock was corrected to match:** uuid duplicate ids, numeric timestamps, and a duplicate's stage is frozen.

## Gates and mutants

**Gates:**
- `check:transport` 0;
- `tsc` 0;
- vitest 2078/2079. The 1 red is the known environmental one, taskKindParity "two, they AGREE".

**Mutants:** M1–M7 each reddened its intended arm with the expected message:
- M1/M2: the sha regex restored on each reader;
- M3: string timestamps;
- M4: `outcome` not copied;
- M5: a recipient with no label accepted;
- M6: raw 409 options;
- M7: the mock's duplicate id in sha form.

## Files

- Code: `b97b9d5`.
  - `src/lib/ingestWire.ts`, `ingestMock.ts`, `canvasExport.ts`, `src/api/client.ts`, `CanvasExportButton.tsx`, plus tests.
  - New: `src/lib/ingestCapture.test.tsx`.
  - The two capture files.
- Packet: `sessions/2026-10-01-packet-to-lane-1-digest-d2e56047-for-roll-12-sealed-on-your-captures.md`.

## Still open (not cortex's to act on)

- HAZ-1003's Restate key is poisoned until 2026-10-01T21:16:18Z. A purge is Chris's call (flagged earlier).
- The engine-cost `agent_fleet` packaging defect is with the architect. Retiring the card export waits on it.
