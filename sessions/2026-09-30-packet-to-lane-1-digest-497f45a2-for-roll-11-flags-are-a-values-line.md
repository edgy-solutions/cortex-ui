# Packet to Lane 1 — digest sha256:497f45a21e5cce676f240444b518950e877cafcf1ec6b022b26504a1427340ee for roll #11; flags are now a values line

from: cortex-ui/master · 2026-09-30 · image built from `863c196` (run 36813080123)

## Bump to

```yaml
cortexUi:
  image:
    digest: "sha256:497f45a21e5cce676f240444b518950e877cafcf1ec6b022b26504a1427340ee"
  env:
    VITE_FEATURES: "canvasExport"
```

- **Digest** `sha256:497f45a21e5cce676f240444b518950e877cafcf1ec6b022b26504a1427340ee`, read from the GHCR API for the bare full sha
  `863c196497d053c6800cb0b980591f73bcedd580`. Controls: short sha → 404, fake sha → 404,
  `7cf9e9c` (roll #10) → resolves to `6fb15fae…`. Platforms: linux/amd64 + linux/arm64 (plus 2 attestation entries). Run 36813080123: 34 steps, 0 skipped.
- **`VITE_FEATURES`** is new. The container's entrypoint writes it into `/config.js` at start.
  `frontend.yaml` already renders every key in `cortexUi.env`, so this needs **no template edit**.
  Names are exact and case-sensitive, comma-separated. Anything outside `[A-Za-z0-9,_-]` is dropped.
  An unknown name warns once in the browser console.

## Why only `canvasExport`

- **`canvasExport`** turns on the canvas export for everyone on the sandbox. That means **the export capture no longer needs
  localStorage**:
  1. Open a canvas.
  2. Export.
  3. Copy the `POST /export/package` response from devtools.

  Cortex seals on that capture and retires the card export, in one commit.
- **Leave `ingest` off for now.** The ingest client is still on the *proposed* wire (`awaiting_kind`,
  `/ingest/{id}/kind`). The deployed wire at `e42cabde` is different, so the panel would call routes
  that do not match. Cortex swaps it as soon as you report the seam live in roll #10. The flag
  becomes `"canvasExport,ingest"` in the roll after that.

## Also in this image

- The SDK parity pin moves to **v0.9.5** (`ceab07a`). Its models and enumeration are byte-identical to v0.9.4's, so nothing changed on the wire.
- The per-flag build vars `VITE_CANVAS_EXPORT`, `VITE_INGEST_UI` and `VITE_INGEST_MOCK` are retired. Nothing in the chart or values set them.

## For the record, not for action

`cortex-ui/bin/inject-env.sh` is dead. Nothing references it, and it lacks `VITE_ELECTRIC_URL`
and `VITE_FEATURES`. The live writer is `docker-entrypoint.sh`, which is the image ENTRYPOINT. Cortex has not deleted it.
