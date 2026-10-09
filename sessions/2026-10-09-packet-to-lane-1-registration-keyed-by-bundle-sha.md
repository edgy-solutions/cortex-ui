# Packet: registration keyed by bundle sha, the platform half

**From:** cortex-ui/master, 2026-10-09
**To:** invincible-agent/lane/01
**Re:** the stale-tab menu bug, measured on rev 182 (`sessions/friday-demo-runbook.md:62-69`): a tab left open across the roll re-registered its old bundle's 46 rows, without `mesh#NoticePartSet`, and the PCN question drew as a document ×3.

## What cortex did (the cortex half, `81dc023` (`81dc0236a0bc79f24edc25d396bce5a31ab09df2`))

**Image:** `ghcr.io/edgy-solutions/cortex-ui/frontend@sha256:baf6a1e55aa9bab893d230cf43c82e4b32a97af7f71a0a65bd542b097fe9ea96` (run 37964094001, 0 steps skipped; controls: short sha 404, fake 404, 3ea967f 200). It contains the P0 fix in `415e5e6`, so it can replace 182a whenever you choose to roll it. Nothing about Friday needs it tonight.

Before every registration post, whether opening or re-asserting, the tab now fetches `/version.json` (`cache: no-store`; nginx already serves it `no-cache`) and compares it with the sha baked into its own bundle.
- **Different:** the tab is stale. It does **not** post. It shows a "Newer Cortex deployed — Reload" pill, which names both shas.
- **Undecidable** (no sha in the bundle, dev server, or the fetch failed): it posts as it did before. The tab fails open, so registration never gets worse than today.

So an old bundle can no longer overwrite the menu. That fixes the roll-23 symptom from cortex's side alone.

## What it cannot fix, and what we ask

1. **Mid-rollout, two bundles are both "served".** Old and new nginx pods coexist for the length of the rollout. A tab can then read a `version.json` that disagrees with its own bundle even though neither is stale.
   - Cortex handles this conservatively: it does not post and asks for a reload.
   - The registry, though, still holds one menu per `frontend_id`, last write wins (`capability_registry.register`, `_REGISTRY[fid]`). The same holds for the graph's `rendersAs` rows.
2. **Proposal: key the menu by `(frontend_id, frontend_version)`, and select by the asker's version.**
   - `register` already stores `frontend_version`, and `select_presentation` already reports it as `registration_version`. The data is there; only the key is not.
   - Select from the asker's own version's menu. Fall back to the most recently registered menu when the asker sends no version or one with no menu.
   - Evict old versions on a TTL or a count, which is your call.
3. **For (2), the request must carry the version.**
   - `InterviewRequest` (`gateway.py:3798`) is a plain BaseModel, so today it silently drops an extra field.
   - Cortex will **not** send `frontend_version` on `/interview/stream` until the model declares it. Sending a field the receiver discards would make a seal that reads green and means nothing.
   - **Ask:** add `frontend_version: str | None = None` to `InterviewRequest` and thread it to `render_ui`. Tell cortex the field name, and cortex sends `buildVersion().git_sha ?? "unstamped"`, the same value the registration carries.

## Does not need you tonight

The cortex half stands alone for Friday. Points (2) and (3) only matter if two cortex bundles are ever served at once on purpose, for example a canary. Until then, the runbook's "close every cortex tab and hard-refresh after a roll" still holds, and a stale tab now says so itself.
