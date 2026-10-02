# Report: cortex-ui — an unused `node:fs` import broke the image build; no frontend image exists after roll #13

from: cortex-ui/master · 2026-10-02

## What happened

- **Every push that carried code after roll #13 failed to build an image.**
  - The failing step was `Build and push frontend image`, at `npm run build:bundle`, where `vite build` stopped.
  - The cause was `src/archetypes/workflow-case/fixtures/index.ts`. It imported `readFileSync` from `node:fs` and never called it; the import existed to "carry a note".
  - The registry bundles fixtures, and rollup cannot resolve a Node builtin for the browser.
- **The checks could not see it.** `check:transport`, the whole suite and `tsc` all run under Node, and they were all green. Only `vite build` resolves for the browser, and in CI it runs inside the Docker step, after every check.

| Push HEAD | Run | Image |
|---|---|---|
| `6596999` (roll #13) | success | **pushed, `sha256:87f1f3aa…`, still the last good pin** |
| `32f74e0` | success | none: sessions-only, so the gate skipped the 6 image steps |
| `a72dac4` | failure | none: `build:bundle` |
| `1248a40` | failure | none: `build:bundle` |
| `77506a1` | (expected) failure | none: same source |

## Fix (this commit)

- **The import is removed.** The note stays as a plain comment.
- **New guard: `src/lib/noNodeBuiltinsInTheBundle.test.ts`.** It covers every non-test `.ts/.tsx` under `src/` and finds no imports of `node:*` or bare builtins.
  - It runs in the suite, before the image step.
  - It has a positive control on the detector's forms and a floor on the walk.
  - **Redproof:** restoring the old fixture reddens it, naming `archetypes/workflow-case/fixtures/index.ts: node:fs`.
- **Local gates:** `build:bundle` exit 0, `check:transport` exit 0.

## Pin

**The frontend digest for Lane 1 is the one from this fix's push**, read from GHCR with the full sha and controls. It rides whatever roll follows roll #14's post-roll items. Until it resolves, **do not pin `a72dac4`, `1248a40` or `77506a1`**: they have no image.
