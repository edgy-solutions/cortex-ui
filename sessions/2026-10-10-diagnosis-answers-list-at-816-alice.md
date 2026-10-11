# Diagnosis: the answers list is unusable at ~816 answers (alice, sandbox)

**For:** Chris, Lane 1. **From:** cortex-ui/master. **Date:** 2026-10-10.

**Inputs.** Chris's two HARs (22:43, 22:45) and his Firefox profile (22:47), all from alice on the sandbox.
- **How they were read.** By key, count and route only: no header values, no row values. The HARs carry 36 and 57 bearer `Authorization` headers, so they are **not committed**, and this PR adds `*.har` to `.gitignore`.
- **Build on the sandbox.** `version.json` reports `git_sha 9bf8063`, built 2026-10-10T04:21Z. That is #3, *older* than the 186 pin `865c080`.
- **How the profile was attributed.** I rebuilt `9bf8063` with sourcemaps. It is byte-identical to the deployed `index-Cr1m6K2I.js` except for the `built_at` string, which has the same length, so every frame's line and column maps exactly.

## What the page does at load

| Layer | Evidence | Share |
|---|---|---|
| **Wire: one full snapshot** | `GET /electric/shape?table=answer_artifact_projection&offset=-1`: **6.82 MB in one chunk**, every column, no `columns`/`where`/limit. A median row is 5.9 KB (p95 12 KB, max ≥ 5.8 MB). In the rows the HAR kept, bytes by column: `routing` 47% (`candidates` alone 35%), `rendered_output` 31%, `resolved_intent` 7%. A list row needs about 200 B. | ~97% of the shape's bytes are body |
| **Render: every answer's body** | Profile thread `GeckoMain/9944`, 113 s, 59,604 samples. Inclusive, by package: react-dom in **70%** of samples, **recharts in 57%**, redux/reselect 19–25% (recharts' internal store), svar grid-store 14%, markdown parse ~3%. `GlobalCanvasStage` mounts a `StageCard` per answer, and each one mounts `AnswerBody` → `SemanticInterpreter`, so every chart in every answer renders and animates (8,769 CSS animation iterations). | dominant |
| **Graph: per-answer edges** | `stageEdges.computeSameSubjectEdges` / `subjectInstanceKey` and `stageLayout` group-by show up as ~9% and ~15% inclusive. Same-subject edges are O(Σkᵢ²), so O(N²) when many answers share a subject. | secondary |
| **List: no virtualization** | `AnswersPanel` renders the whole filtered list (Timeline/Clusters). Search is a client-side `includes` over a full-content index built from every body. | secondary at 816, linear in N |
| **Registration** | 7× `POST /register_frontend_capabilities`, 44.8 KB each. Four of them fire in parallel at +63 s, and those four come back 502 after 78 s. The "re-assert" path subscribes to every artifact change. | wire, not CPU |
| **BFF stall (server)** | Every BFF call in flight at +1.9 s returns at about +35 s: register, `fleet/version`, `mesh/config` preflight, and 7 `federated_image` fetches. Each shows `wait` ≈ 33 s. From +63 s there are 502s, then 404s on preflight from +148 s. The BFF looks wedged and then restarted. | Lane 1 |

**Time to interactive, before.** The profile has **101 long tasks totalling 78 s, the longest 17.2 s**. Both ≥ 5 s quiet windows (+62 s and +71 s) end in fresh 13 s and 17 s tasks. **TTI is never reached within the 113 s profile.**

## Which layers the ruling's four items land on

1. **Summaries only, paged 50, newest first; bodies on open.** This is wire work, so it falls to Lane 1, which needs to provide a summary route, a body route, and an index.
   - The proxy *does* pass `columns`, so a summary-only shape is possible today.
   - But nothing can return one body on open: the proxy injects `where`, and `GET /artifacts/{id}` deliberately excludes `rendered_output`.
   - So cortex keeps the full shape for now and stops *rendering* the bodies. The asks are in `sessions/2026-10-10-packet-to-lane-1-answers-at-scale-summary-route-body-route.md`.
2. **Virtualized render.** Cortex (the list).
3. **No per-answer work on load.** Cortex: the canvas mounts a body only for the opened card, edges are computed for the opened card only, and registration re-assert is not driven by the load.
4. **Search and filters server-side.** Lane 1 provides the index and the query params. Cortex sends the query instead of filtering locally.

The PR carries the measurements: TTI at 1,000 and 10,000 synthetic answers, before and after.
