# 2026-11-10: can a deployment overlay add or replace export profiles without a committed file? No, not as an overlay

**Dispatch (the architect, via Chris), part B, before building:** "can a deployment overlay add or replace export
profiles without a committed file? If not, making that possible is part of this work. Lane 1 names the
server-side owner; you own the UI. Not on 0.4.85."

This report is read from code only, and nothing was built.
- invincible-agent is read from git objects at the producer pin `4f2dac35` and at `origin/master` `a02cfda3`.
  Every file cited here is the same at both.
- I did not render the chart, and nothing on the cluster was read.

## The answer

**No.** Review-export profiles have no overlay. A deployment can only **replace the whole directory**, and the one
channel that can deliver that directory without a new image is still a **committed file**: in the deployment's
private policy repo, at a pinned sha.

## Why, from code

1. **The loader reads one directory and nothing else.**
   - The loader is `src/iagent/export_profiles.py` `_profile_dir()` and `load_profiles()`.
   - It reads `INGEST_EXPORT_PROFILE_DIR`. If that is unset, it walks up to `policy/exports`, and then falls back to
     `/app/policy/exports`.
   - It globs `*.yaml` in that one directory, so there is no seed-plus-overlay merge, no replace by `name`, and no
     `deleted: true` tombstone.
   - It caches per directory for the life of the process.
2. **The registry says so.** `policy/export_profile_sources.yaml` lists `review-export` with `overlay_env: null`.
   - Its two siblings do have overlays: `answer-export` (`EXPORT_PROFILE_OVERLAY_DIRS`) and `fin-cdrl`
     (`FIN_EXPORT_PROFILE_OVERLAY_DIRS`).
   - Both sibling loaders already replace a row by `name` and honour the ADR-0036 tombstone. The pattern exists in
     the repo, just not for this loader.
3. **The seed is baked into the image.** The BFF image is built from the repo root (`build-containers.yml`,
   `cortex-bff`, `path: .`), and `agent_fleet/cortex_bff/main.py` runs `src.iagent.gateway`, the app that serves
   `/ingest/export*`. So `policy/exports/*.yaml` ships inside the image. Adding a profile there means a commit to
   invincible-agent and a new image.
4. **The only delivery channel without a new image is `policyOverlay`, and it uses committed files.**
   - It is ruled channel 2026-11-02, in `values.yaml` `policyOverlay` and the `_helpers.tpl` `policyOverlay*`
     helpers. The cortex-bff deployment in `frontend.yaml` already includes them.
   - An init container clones the private policy repo at a full sha or a tag. It copies only the directories listed
     for a component, and sets that component's env var to the copy.
   - cortex-bff's list today is `{dir: canvases, env: CANVAS_OVERLAY_DIRS}`. The rows are generic, so a deployment
     *could* add `{dir: exports, env: INGEST_EXPORT_PROFILE_DIR}` in its values. I read this from the helpers and
     did not render it. But that row would:
     - **replace the seed directory outright**: the shipped profiles disappear unless the deployment copies them in;
     - still be **a committed file**, in the private policy repo at a pinned ref. That is by design: the ref sits in
       the pod template, so a change rolls the BFF and shows up in the values diff.
   - `policyOverlay.enabled` is `false` in bare defaults and on sandbox, which keeps the baked sample.
5. **No path from values or a ConfigMap reaches the export profiles.** `topazSeed.policySource` (git or ConfigMap)
   delivers the grant data files to the sync jobs, not to this loader.

## So the work includes making it possible (owner: Lane 1 names it)

Making the review-export loader match its two siblings is a server change. As I read it, it has four parts:
- **An overlay variable.** Add `INGEST_EXPORT_PROFILE_OVERLAY_DIRS` (separated by `os.pathsep`). It would replace a
  row by `name`, honour `deleted: true` as ADR-0036 does, and refuse a malformed set by naming every bad row, as
  the answer-export loader does.
- **The registry.** Set `overlay_env` for `review-export` in `policy/export_profile_sources.yaml`.
- **The chart.** Add an optional cortex-bff row in `policyOverlay.components`:
  `{dir: exports, env: INGEST_EXPORT_PROFILE_OVERLAY_DIRS, optional: true}`. Then a deployment adds or replaces
  profiles through its policy repo, and its seed stays intact.
- **Ruling 7, the sandbox.** Add `policy/overlays/sample/exports/part-list.yaml` (`per_part`, one column), and point
  the sandbox values at that directory, as `FIN_EXPORT_PROFILE_OVERLAY_DIRS` is pointed at
  `policy/overlays/sample/fin_export_profiles`.

**"Without a committed file" taken literally.** Nothing in the platform accepts a profile that is not committed
somewhere. `policyOverlay` refuses a branch and requires a sha or a tag, because the 11-02 ruling wants every
delivered policy pinned and visible. If the intent is "without a commit to invincible-agent and without a new
image", the four parts above achieve it. If the intent is "with no commit anywhere" (a ConfigMap from helm values,
say), that would be a new channel, and the 11-02 ruling chose against an unpinned one.

## Rulings 1 and 5 touch the same loader (for Lane 1's sizing)

- **Ruling 1** adds three keys to the review-export header: `accepts` (content kinds), `grain` (`per_notice` or
  `per_part`, with optional dedupe) and `version`. Today the header carries `column_map_version` and a
  `granularity` of `notice_part`.
- **Ruling 5** makes one route out of the review export and `/export/package`. The two loaders "speak ONE profile
  language … until the export-profile header type lands in the SDK (iagent-mesh v0.9.12); one loader then reads
  both" (`policy/exports/answers/README.md`). Folding them into one loader would give review export its overlay at
  the same time. Lane 1 should decide whether to build the overlay now or as part of that merge.

## Cortex's side, for when it is ruled to build (not on 0.4.85)

- The panel above the answers list is removed.
- "Export as…" joins the lasso bar.
- It reads the selection's notices and offers only the profiles the server serves, filtered to those whose
  `accepts` covers every kind present.
- It lists the notices that cannot be exported, with reasons, before download.
- "Select by range" sits inside the dialog.
- Personal download is the default.

None of that depends on the overlay question, only on the served profile shape (rulings 1–3).

## Part A

The question is dropped from our placed packet
(`invincible-agent/sessions/2026-11-10-packet-to-lane-01-cc-architect-openddil-from-cortex-0-4-85-candidate-90b7c13-option-data-and-the-held-task-link.md`,
still uncommitted). That section now records the ruling: the per-viewer PR, label dimensions as well as the
recipient, withheld never redacted, and the sha to follow. The case panel is unchanged. When it lands, cortex adds
the served-shape test only.
