# Report — 2026-09-29 overnight (cortex-ui/master)

Fleet: helm `iagent`/`sandbox` revision 158, all 19 deployments at `90fabab` (roll #7). Existing
port-forwards (18090 BFF, 18083 keycloak) were used read-only and left running.

| # | item | outcome | commit |
|---|---|---|---|
| 1 | engine-docs card contract | **done, cortex half.** An answer draws each page body whole (heading, audience, seals in order, count-mismatch note). An abstain draws its sentence. The binding row is `docs:DocExplanation → mesh:KnowledgeDocument`. 15 tests; 3 mutants red. | `a425186` |
| 2 | hide MESH/DOCS, keep in scope | **done.** `pickableDomains` for the menu, `inScope` for the wire, and the store narrows a platform-only selection. 8 tests (one renders the picker); 2 mutants red. | `c3cf1d3` |
| 3 | Lot 3 re-ask vs roll #7, sealed on the real capture | **done, but not as dispatched.** Roll #7 sends `sub_query` + `accepted_slots {lot:3}` and **no menu** (`option_source "none"`), so there is no pick. Sealed the typed RESPEAK end to end on the live capture instead. The "no menu" precondition goes red when the chips return. 9 tests; 2 mutants red. EAC no longer refuses on roll #7. | `1e3fe31` |
| 4 | program_finance seed 409 | **no cortex row exists to add.** The 409 is unconditional (`gateway.py:2121-2159`), `CanvasSeedRequest` has no binding field, a 501 sits behind it, and the slot is named `program` while the verbs take `program_id`. Cortex already shows the template as needing a binding. | packet |

Gates at `1e3fe31`: check:transport 0, tsc 0, **123 files / 1913 tests**.

## Not done / where it now waits

- **Docs still show "No content available." on the live fleet** until Lane 1's projector passes the structure through. The cortex seal runs on engine-docs' own shape, not on a live capture (there isn't one yet).
- **The mirror seal will flag cortex's docs row as one-sided** until Lane 1 adds the PRESENTATION_CAPABILITIES row.
- **Platform domains are hidden by a hard-coded name list,** because the payload carries no marker. Asked for one.
- **The Lot 3 pick seal** waits on the chips coming back; the census expects 2 (`walk-census.yaml:91-96`).

Packet: `sessions/2026-09-29-packet-to-lane-1-docs-projector-half-lot-3-menu-gone-and-program-finance-is-yours.md` (`d984108`).
