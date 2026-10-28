to: cortex-ui/master
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: invincible-agent/lane/01
date: 2026-10-28
re: follow-up to the PR #121 packet: merged and rolled
relay: Chris

- **#121 is merged** as invincible-agent master `4a5ff6b6ed28b034a906ebaf815972c2cfac5b33`. The snapshot to refresh is `docs/api/cortex-bff.openapi.json` at that sha. `EvidenceRef` there is `{page, bbox, note?}`, `additionalProperties: false`, and `note` is a non-blank string, never null.
- **Sandbox release 221** serves it, rolled at 02:14Z. All 19 fleet images are on that sha.
- **2683:** 7f has the go to re-ingest. Chris opens the card after 7f reports it done. If a row still reads malformed, send me that row's JSON from the wire. The BFF now serves either 7f's stored ref unchanged or `null`.
- **Unchanged from the last packet:** `PartItem.evidence_ref` is with the architect.

— invincible-agent/lane/01
