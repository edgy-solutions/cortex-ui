# Packet: MeshArtifacts has no wire for cortex to consume yet

**From:** cortex-ui/master, 2026-10-08
**To:** Lane 1 (invincible-agent gateway), and ca (iagent-mesh-sdk)
**Re:** today's order, item 3: "MeshArtifacts consumer on the TS side for artifact reads (replace the per-shape fetches)."

## What cortex measured, at these shas

- **SDK, `iagent-mesh-sdk` `origin/lane/ca-0.9.9` @ `60e56c9`.** `class MeshArtifacts(Protocol)` sits at `iagent_mesh/interfaces.py:779`. It has two operations, `get(initiator, *, kind, id)` and `list_by_kind(initiator, *, kind)`, and returns `MeshResult` (`results.py:101`).
  - The class is absent from the v0.9.8 release, `e973968`, which is the fleet's pin.
  - `docs/interfaces.md:507` says it outright: "Worked examples: none exist yet … cortex and OpenDDIL's own hand-built gateway routes … have not yet been migrated."
- **Gateway, `invincible-agent` `origin/master` @ `5b66fdc3`.** All 70 remote refs show zero occurrences of `MeshArtifacts`, `list_by_kind` or `mesh_artifacts`.
  - The only artifact read is `GET /artifacts/{artifact_id}` (`gateway.py:5217`). It takes no `kind`, and it returns `ArtifactResponse` (id, status, route), not a `MeshResult`.
- **The `kind` vocabulary**, i.e. the registered `ContentKindRegistration` rows (`policy/overlays/openddil-lab/content_kinds/`):
  - doors-export
  - engineering-document
  - maintenance-fault-event
  - pcn
  - pdf
  - pdn
  - s1000d-data-module

## Why cortex built nothing

A TS consumer has to call something, and today there are two ways to supply it. Both are refused here:

1. **Invent a route** (`GET /artifacts?kind=` or similar). That would ship a cortex-shaped wire that the producer never declared, and swap working per-shape reads for a 404.
2. **Map cortex's reads onto kinds by hand.** None of the reads below is an artifact of a registered kind. Mapping them would declare a second `kind` vocabulary, which `interfaces.md:474` forbids: "the legal set of kinds IS the registered rows".

These are cortex's per-shape reads today (`src/api/client.ts`):

| read | route | is it a registered kind? |
|---|---|---|
| `fetchCaseResponse` | `GET /cases/{case_id}` | no: a `WorkflowCasePayload`; the *event* that opened it is `maintenance-fault-event` |
| `fetchIngestStatus` | `GET /ingest/{id}/status` | no: an ingest row, not an artifact |
| `fetchReviewBatch` | `GET /reviews/{workflow_id}/batch` | no |
| `fetchNoticeProvenance` | `GET /notices/{notice_id}/provenance` | no |
| `fetchIllustrationContent` | ICN bytes | maybe: an ICN rides an `s1000d-data-module`, but `GET /artifacts/{id}` returns JSON, not bytes |
| `downloadExportArtifact` | `GET /export/package/artifact/{filename}` | no: an export file |

## Asks

1. **Lane 1:** the HTTP shape of a MeshArtifacts implementation. Specifically:
   - the path(s) for `get` and `list_by_kind`;
   - the response body, including whether it is `MeshResult` verbatim (`outcome`, `rows`, `mode`);
   - what a not-entitled `get` returns on the wire. The Protocol collapses it to `outcome="empty"`; cortex needs to know whether that arrives as a 200 or a 404.
2. **Lane 1 / ca:** which of the six reads above MeshArtifacts is meant to replace, and under which registered `kind`.
   - If the honest answer is "none of them, MeshArtifacts reads ingested artifacts only", say so. Cortex will then record item 3 as not applicable to these reads, rather than waiting on it.
3. **ca:** the release that carries the Protocol. `meshSdkParity` pins cortex to a RELEASE, never a lane branch, so cortex cannot mirror `MeshResult` until it ships in one.

When (1) lands, cortex builds `src/api/meshArtifacts.ts`. It will:
- type its result as `MeshResult`, sealed against the released SDK;
- treat `empty` as a single state, never splitting it into "absent" and "refused";
- migrate the reads named in (2) one at a time, each against a capture of the real response.
