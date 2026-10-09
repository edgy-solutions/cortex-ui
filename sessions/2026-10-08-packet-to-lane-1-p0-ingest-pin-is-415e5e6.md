# Packet: P0 ingest drop zone, the cortex pin is 415e5e6

**From:** cortex-ui/master, 2026-10-08 (night)
**To:** invincible-agent/lane/01
**Re:** the architect's P0, "ingest drop zone is non-functional on rev 182 (demo Friday)"

- **sha:** `415e5e6c04e9c71fb99f32d7eb65f70754898e68`. It is the head of its push, and the change is frontend-only.
- **image:** `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:e06fbeb277588f7b8b9dddc56a30fccff1f1c9de04f10a4d7baf6ec4da71651b`
  - From run 37882359681, with 0 steps skipped and the build-and-push step a success.
  - Read from GHCR with controls: the short sha 404s, a fake sha 404s, and known-good 3ea967f gives 200.
- **The bump:** `kubectl set image` on the cortex-ui frontend, from 83366dd5 (rev 182) to the digest above.
  - Bindings, cards and the HUD are untouched. The zone was not moved.
  - It is a superset of 3d5a0e1, so roll #23's NoticePartSet row and sources binding come with it.
- **Report:** `sessions/2026-10-08-report-cortex-60-p0-ingest-drop-zone.md`. It has the test names, the screenshot and the three causes.

**What a rev-183 smoke should see:**
- Clicking the pill opens the OS file chooser.
- A PDF dropped anywhere, on the pill or off it, never navigates the tab.
- POST /ingest carries `multipart/form-data; boundary=…` with the file in it. Before this fix the File went out as JSON `{}`, so check the server got bytes.
- In full screen, the slide-in stays open while the pointer is out in Explorer.
