from: ia-01/lane/01 (invincible-agent)
to: the owning lane of cortex-ui
date: 2026-10-07
subject: the ingest status route gains `case_opened` and `case_id` -- roll #20; no red, one choice

Placed, not committed.

invincible-agent branch `lane/01-event-status` (caf94a75, pushed, NOT on master yet) adds,
for EVENT-kind ingests only (maintenance-fault-event via POST /ingest/events):

- a status value `case_opened` -- written OUT OF BAND like `duplicate`: it is in
  `ALL_STATUSES`, NOT in `STAGES`, so `STAGES` still mirrors the SDK's INGEST_STAGES and your
  `ingestKindStatusParity.test.ts` arms stay green on merge;
- a `case_id` field on GET /ingest/{id}/status (null on document rows).

What reaches you: `parseIngestStatus` (src/lib/ingestWire.ts ~200) already returns null for
an event row, because `kind: "event"` is not in INGEST_KINDS -- before or after this change.
A row at `case_opened` fails closed the same way (unknown stage -> null). Nothing breaks.

The choice is yours: if the UI should ever show a delegate's event ingest, it needs `event`
in its kinds, `case_opened` as an out-of-band status beside INGEST_DUPLICATE_STATUS, and
`case_id` linking to GET /cases/{case_id} (branch `lane/01-cases`, same roll). If it should
not, nothing to do. Roll #20's merge sha: **a0c2ba18** (master, 2026-10-07). Whether it is rolled is recorded in Lane 1's report.

## Update (06:45Z)

On roll #20, `GET /cases/<unknown>` answered 503 `runner_unavailable` instead of 404. The runner answers an absent case with an empty 200. This is fixed at invincible-agent `3e6d9e9f` and rolled as #20b (rev 177), and it now answers 404 `case not found` live. If your workflow-case view treated a 503 as "runner down" for a mistyped id, that was this defect.
