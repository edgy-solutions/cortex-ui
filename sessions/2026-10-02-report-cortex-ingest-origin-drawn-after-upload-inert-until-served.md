# Report — cortex-ui: ingest origin is drawn after upload; inert until the producer serves it

from: cortex-ui/master · 2026-10-02
dispatch: "The drop zone has no origin field. After upload it shows what the system found … Visibility banner on artifacts whose origin is unresolved."
producer read: invincible-agent origin/master `41647787`

| Clause | Outcome |
|---|---|
| Drop zone has no origin field | Sealed: no origin/program/domain/owner input; the upload key set EQUALS `{file, kind, on_behalf_of}`. `kind` is the format and stays |
| Shows what the system found | `IngestStatusCard` draws `origin`: resolved / unresolved / not reported. Absent is never shown as unresolved, and no part is invented |
| Single "this looks wrong" → steward | One button, on resolved origins only. It calls the proposed `POST /ingest/{id}/origin/dispute`. A 404/405 says the server doesn't accept disputes yet |
| Steward sees suggestion + evidence in the approval card | `ApprovalTaskCard` draws `payload.suggestion` and `payload.evidence[]` for any kind. A source guard keeps domain words out of the card |
| Banner on unresolved artifacts | `OriginUnresolvedBanner`, mounted beside `ProvenanceFloorLabel` above every archetype |

**Nothing upstream serves any of it.** There is no origin on status, no dispute route, no steward kind, and no origin on components. Your systems-of-record packet says nothing sets origin yet. The packet asks for four things and the captures.

## Mutants O1–O7, each RED on its arm and restored from a backup

| Mutant | What it changes |
|---|---|
| O1 | absent read as unresolved |
| O2 | "unknown" filled in for a missing part |
| O3 | dispute button shown on an unresolved origin |
| O4 | an origin field in the upload |
| O5 | banner mounted in one case instead of the loop |
| O6 | evidence after the first item dropped |
| O7 | "steward" in the card's source |

## Limits

- **KNOWN GAP: the banner is proven for 22 of the 28 display archetypes, and NOT proven for 6.** APPROVAL_TASK, ELICITATION, GROUPED_REVIEW, INSTANCES_BY_PROPERTY, TRIAGE_TASK and WORKFLOW_OBSERVATION throw on a minimal component (with or without `origin`), so the test asserts nothing about them. The loop mount is a reason to expect the banner there, not a measurement of it.
  - The test names them in `BANNER_UNPROVEN` and holds that list by EQUALITY with what actually throws. A new thrower reddens it, and so does one that starts rendering. Either way the test says to update the list, so the banner test grows as these cards gain minimal fixtures for other reasons.
  - Mutants G1 (drop a member) and G2 (add WORKFLOW_CASE, which renders) are each RED on that assertion with its message. Both were restored from a backup.
- **`IngestStatusCard` takes `onBehalfOf` as a prop from `IngestPanel`.** It does not call `useAuth()`, because every existing test renders it without an auth provider.

## Gates

- check:transport 0 (the dispute rides the `api` wrapper, as the upload does).
- tsc 0.
- Scoped vitest: 21 files, 333 passed, 4 todo.
- Implementer's full run: the only reds are the known noise set (timeouts under load, which pass alone, and taskKindParity "two, they AGREE").

## Files

- Packet: `sessions/2026-10-02-packet-to-lane-1-ingest-origin-shown-after-upload-four-wire-asks.md`
- New: `src/lib/ingestOrigin.ts` (+test), `src/components/ingest/OriginUnresolvedBanner.tsx` (+test), `src/api/uploadIngest.test.ts`
- Modified: `client.ts`, `ingestWire.ts`, `ingestTransport.ts`, `ingestMock.ts`, `taskArtifact.ts`, `IngestPanel.tsx`, `IngestStatusCard.tsx`, `ApprovalTaskCard.tsx`, `SemanticInterpreter.tsx`, and their tests
