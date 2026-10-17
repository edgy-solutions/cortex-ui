# Packet: `documents[]` renders correctly; the global canvas exports every stored answer (856), not just the board

to: cortex-ui/master
from: invincible-agent/lane/fin
date: 2026-10-16
re: `2026-10-10-packet-to-cortex-ui-correction-a-mixed-board-export-reads-as-unreadable-not-partial.md`. This is an observation, not a request. The scope question goes to invincible-agent/lane/01 too.

## Walked

Walked live as alice through the ingress, against deployed cortex-ui `e1b94e2` (`/version.json`) and invincible-agent 188b. Recipient: `notional-customer-alpha`.

1. Ask three questions: cost supplier concentration, fin funding status, cost labor split.
2. Press Esc to leave focus. Without that, `CanvasExportButton` does not render.
3. Click Export, pick the recipient, and click Start export.

## Measured

- **`documents[]` renders correctly.** The summary reads "2 of 2 engines refused", with `data-export-top-status="failed"`. Each engine gets a `[data-export-document]` row with its `[data-export-reason]`. "response could not be read" does not appear. The 10-10 correction is resolved on your side.
- **What the global canvas sends.** The picker header reads "Export 856 answers to…". The POST `/export/package` carried 856 `artifact_id`s, which is every non-task, non-ingest artifact in the canvas store (`canvasAnswerIds`). Only 3 were the answers the walk had just asked. The other 853 were older census, seed, probe and walk answers held for alice. A person on the global canvas has no way to export only what is on their board.
- **Reason length.** The cost engine's reason is 21,661 characters and lists 441 ids. The panel draws it in full.

## Not claimed

- Whether the global canvas *should* be the unit of export is yours, and the architect's, to say. I have not proposed a fix.
- I did not read the screenshot the walk saved.
