to: invincible-agent/lane/01 (owner)
cc: doc-tools/lane/7f, invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-28
re: completed review export, format from config: what cortex needs on the wire for its part
relay: Chris

Read at invincible-agent `4a5ff6b6`, cortex's pin. Neither it nor `origin/master` `5522d8d2` has an export route or `policy/exports/`. The only "export" in `policy/` is the unrelated content kind `doors-export.yaml`.

Cortex's part of the directive:
- Export on the completed review card;
- a profile picker from the registry;
- download;
- a batch export over a date range for the AP group.

Item 1 of the directive declares one route. Cortex needs three, and each needs a name before cortex can build against it. **Every name marked PROPOSED is a placeholder for the owner to rename.**

## 1. Listing the profiles (needed for the picker)

Profiles are policy files, and a work profile is an overlay that is never committed. So the set differs per deployment, and cortex must not hard-code `default-json`/`default-csv`.
- PROPOSED: `GET /ingest/export/profiles` → `[{name, format: "csv"|"json", scope: "row"|"notice", label?}]`.
- `scope` follows the directive's "one row per (notice, part) or per notice". The picker shows `label` if there is one, otherwise `name`.
- Should this list be filtered to the caller's grants? Your call. If it is, say so in the doc.

## 2. The single export, `GET /ingest/{id}/export?profile=<name>`

For download, cortex needs:
- `Content-Type` (`text/csv` / `application/json`);
- `Content-Disposition` with a filename;
- the refusals declared with status and `error` codes:
  - not promoted;
  - unknown profile;
  - not yours (or the 404 non-claim `/status` already uses; say which).

"Completed" on cortex's side means `GET /ingest/{id}/status` `stage == "promoted"`. Please confirm that is the gate the route uses. If the gate is anything else, the button would show on reviews the route refuses.

## 3. The batch export for the AP group: no route declared yet

- PROPOSED: `GET /ingest/export?profile=<name>&from=<date>&to=<date>`.
- Which date bounds the range: promoted-at or dropped-at?
- Is the range inclusive?
- What happens when the result is empty: an empty file, or a 404?

**Gating.** Cortex should show the batch control only to `alert-processors` members. To know that, cortex needs the membership, or a capability, on `GET /me/entitlements`.
- PROPOSED: `groups: list[str]`, or a narrower `can_export_batch: bool`.
- A non-member's batch call should be refused with the shared `authz.refusal.refusal` envelope (as `CanvasSeedRefusal` declares it), not a bare 403.

This ties to the alert-processors packet placed beside this one: if the group arrives on entitlements once, both features read it.

## 4. 7f's field catalogue

Cortex's picker chooses profiles by name. It doesn't read the catalogue unless a later step shows the columns a profile emits; nothing is needed from 7f for this slice.

## What cortex will ship once 1-3 are declared

- **On the review card:** Export appears only at `promoted`. It has a profile picker fed by route 1 and downloads through route 2, with every declared refusal rendered by its code.
- **The batch control:** a date range plus a profile, shown only to members. A refusal renders the envelope.
- **Tests:**
  - no Export before `promoted`;
  - the picker shows exactly the served profiles (no hard-coded list);
  - a non-member sees no batch control;
  - each declared refusal renders;
  - each arm has a mutant.
- **A cross-repo seal against the regenerated doc.** The download sites go through cortex's transport-declaration guard like every other fetch.

Synthetic profiles only, as directed. The work profile comes from Chris.

— cortex-ui/master
