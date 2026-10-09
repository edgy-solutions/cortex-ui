# Report: P0, the ingest drop zone on rev 182

**For:** the architect, and Lane 1 for the bump. **From:** cortex-ui/master. **Date:** 2026-10-08, late.

## In the order's report format

| | |
|---|---|
| **sha** | `415e5e6c04e9c71fb99f32d7eb65f70754898e68`, `fix(ingest): P0 — the drop zone takes a drop and a click on rev 182` |
| **digest** | `sha256:e06fbeb277588f7b8b9dddc56a30fccff1f1c9de04f10a4d7baf6ec4da71651b` (run 37882359681, 0 skipped; controls: short 404, fake 404, 3ea967f 200) |
| **screenshot** | `sessions/2026-10-08-p0-ingest-drop-received.png` |
| **packet to Lane 1** | `sessions/2026-10-08-packet-to-lane-1-p0-ingest-pin-is-415e5e6.md` |

The screenshot shows a pointer-aimed synthetic drop that has reached the `received` rung. It was taken on the dev server against the Friday fixtures (`e2e/fridayRoutes.ts`, act 4b), not against the sandbox.

## Test names

**e2e: `e2e/ingestDrop.spec.ts`** (Playwright, aims at the pill's centre as a pointer does)
1. `the pill is what the pointer hits at its own centre`
2. `clicking the pill opens the file chooser`. This is the input-opened proof, through Playwright's `filechooser` event.
3. `a drop on the pill is cancelled (no navigation) and reaches POST /ingest`. It covers (i) and (ii) of the order, and asserts a multipart body that carries `filename="PCN26-117.pdf"`.
4. `a drop that MISSES the pill is still cancelled — the tab never navigates`
5. `FULL SCREEN: the slide-in survives the pointer leaving the window, and a drop still lands`

**vitest: `src/components/ingest/IngestDropZone.test.tsx`** (9 arms)
- `a click on the pill calls input.click()`. This is the order's input.click spy.
- `Enter and Space on the focused pill call input.click() (the keyboard path)`
- `the input accepts PDF and XML, and a chosen file reaches onFileSelected`
- `dragEnter: preventDefault AND stopPropagation`, plus the same arm for `dragOver` and for `drop`
- `the dropped file reaches onFileSelected`
- `cancels dragover and drop when the drag carries Files` (the window guard)
- `leaves a canvas chip drag (text/plain) alone, and is gone once uninstalled`

**vitest: `src/api/uploadIngest.multipart.test.ts`** (2 arms)
- `is still a FormData, carrying the File itself (not its JSON `{}`)`
- `does not leave the instance's application/json on the request`

## Three causes, not one

1. **A drop that missed the pill navigated the tab.** Nothing cancelled a file drop outside the zone.
   - Fix: the zone's dragenter, dragover and drop now call preventDefault and stopPropagation.
   - `src/lib/fileDropGuard.ts`, mounted in `App`, cancels any *Files* drag at window level.
   - The canvas's own `text/plain` chip drags are left alone.
2. **In full screen, the slide-in unmounted under the user.** The right rail is hover-only in full screen, and the slide-in lives inside it.
   - Taking the pointer out to Explorer collapsed the rail. The returning drop or the chooser's change event then hit nothing.
   - Fix: the rail ignores mouse-leave while `[data-ingest-slide-in]` is open, in `Layout.tsx`.
   - At normal layout, (b) "click opens nothing" did not reproduce, in dev or in a production bundle. Full screen is the reading that does reproduce.
3. **Even a file that got through was never sent.** The axios instance's default `Content-Type: application/json` made it JSON-stringify the FormData, so POST /ingest carried `{}`.
   - Fix: `uploadIngest` passes `multipart/form-data`. The adapter drops that header, and the browser adds the boundary.
   - This would have failed on the sandbox even with (a) and (b) fixed.

## Gates on 415e5e6

- **tsc, check:transport and build:bundle:** all 0.
- **vitest:** 2691 passed, 6 red.
  - 4 are the known local-only cross-repo reds: meshSdkParity "names a RELEASE", taskKindParity "two, they AGREE", and 2 in ingestKindStatusParity.
  - 2 are file-walk tests that hit the 5 s timeout under full-suite load and pass alone.
  - CI ran the suite with both peers present, and it was green.
- **e2e:** on the dev server, 7 passed and 1 was skipped (friday.spec.ts:98, an existing `fixme`). On the production bundle, 5 of 5 passed.
- **Mutants M1–M6:** each removed one fix. Each turned its own named arm red, and each restore was verified.

## Notes

- **The kind picker uses pdf/cad/xml/event, not pcn/pdn/pdf/xml as the order put it.** That is the wire's closed `kind` set, the one cortex mirrors as `INGEST_KINDS`. pcn and pdn are document types, not upload kinds. Adding them would be a contract change, and tonight's order is frontend-only.
- **The composer relocation is not in this sha.** The architect's ruling (move the drop target to the composer, remove the HUD icon, the overlay and their tests) will land in separate commits. None of them will be offered as tonight's pin.
