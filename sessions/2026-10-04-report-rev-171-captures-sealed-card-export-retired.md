# Report and packet to Lane 1: rev-171 captures sealed, card export retired, two producer-side items

**From:** cortex-ui/master · 2026-10-04 (overnight)

**Dispatch:** "Captures are in sessions/ now (export 200 + artifact, HAZ-1003 row as bob, the drop): seal all three; retire the card export. DMC citation check once Lane 1 serves `label` = DMC. Report the digest for roll #18 if anything changes."

**Fleet measured:** helm rev 171, fleet `4c3b61a6`. That is also cortex's `PRODUCER_REF`, so no pin bump was needed.

## Digest for roll #18

**Pin d4bb0d22c009a5267cfe0bf6f8c09988571c001a: `sha256:c8a0367850e5885308a178f961d060c133224ceea1ab3ecf6c15fd9042b88a00`.**

- It was built by run 37261422563: 34 steps, 0 skipped, Build Frontend succeeded.
- The digest was read from the GHCR API, by the bare full sha, with controls:
  - short tag: 404;
  - fake sha: 404;
  - known-good b49db01: 200 (`sha256:49767746…`).
- **Pairing:** a producer at or after 1c10e28c (the deployed fleet is 4c3b61a6). That rule is unchanged from b49db01.
- This report commit is sessions-only, so it builds no image. Pin d4bb0d2, not this report commit.

## 1. Export: the first witnessed `exists`, sealed. The card export is retired.

**What the captures are:**

| Capture | Content |
|---|---|
| `…-export-package-rev-171-1-recipients.json` | the recipients |
| `…-export-package-rev-171-2-post.json` | the POST, returning `exists` |
| `…-export-package-rev-171-3-get-artifact.json` | the artifact GET, 200 |
| `…-export-package-rev-171-4-get-artifact-no-token.json` | the artifact GET without a token, 401 |

**What `src/lib/canvasExport.test.ts` now seals on them:**
- The recipients reader yields exactly the served list.
- `artifactLink(readCanvasExport(body))` draws a link from the served body:
  - `href` is `artifact_uri`;
  - `sha256` is `artifact_sha256`;
  - the filename and the byte count are the served ones.
- The request cortex builds has the captured request's key set.
- The artifact GET's `content-length` equals the advertised `artifact_bytes`.
- Without a bearer, the artifact GET is 401. So the link has to be fetched through the minted wrapper, and it is: `CanvasExportButton` uses `href="#"` plus `downloadExportArtifact()`, not a bare anchor.

**This met the retirement criterion** from the roll-12 packet: one `exists` capture and the GET of its artifact. So `CardExportButton.tsx` is deleted, and `StageCard` no longer renders it. Its data layer (`cardExport.ts`, `cardExportCapture`, the finance and fixture seals) is kept.

**⚠ The gap this opens, recorded rather than hidden.**
- The card export was the only cortex surface that read a component's `method` block (formula and inputs).
- With it gone, `method` has **no reader in cortex**. `projectedTupleParity` now asserts this as a dated KNOWN GAP: a repo census showing no `readMethod(` call outside `cardExport.ts`. The census is guarded against an empty scan.
- The row-guard (never `readMethod` on a row) survives as a repo-wide scan.

**Ask E1.** Does the server-built package (`sections: ["material"]` in this capture) render the method block, i.e. formula and inputs, that the card export used to print?
- If it does, say which section carries it. The gap then closes on your side, and cortex re-points the parity arm to cite it.
- If it does not, a reader of the exported HTML gets fewer numbers' provenance than the card export gave.

## 2. HAZ-1003 as served (rows read by bob)

**What the seal checks.** Both pending rows render through the production path: row → `humanTaskFromRow` → `taskToArtifact` → `ApprovalTaskCard`. Each row:
- offers exactly `accepted`, `rejected` and `returned_for_rework`, in the declared order, and never `approved`;
- requires a reason for `accepted` and `rejected`;
- has `payload {}`, from which nothing is drawn.

**Found and fixed on cortex's side.** The live pipeline dropped a row's own `declaration`:
- `seedFromRest` never read it, and `taskComponents` never passed it on.
- So the card fell back to the `/task_kinds` registry. That is the same source today, but it is silently not the row's own declaration.
- The declaration is now threaded through. The seal runs with the registry emptied, so the fallback cannot mask it.
- The Electric live projection does not carry `declaration`, so a live upsert still falls back to the registry. That is deliberate and commented.

**⛔ Ask H1, producer-side: the stranded row.** The capture shows two pending rows for one acceptance:

| Task id | What it is |
|---|---|
| `risk-acceptance-HAZ-1003-medium~1:acceptance` | the case runner's instance |
| `risk-acceptance-HAZ-1003-medium:acceptance` | the bare key, stranded from the retired SafetyAcceptance path (pre-`9ae5861f`), per the capture's own note |

- Cortex renders both. It will not dedupe, because two task ids are two tasks to it.
- So bob sees the same decision twice. Deciding the stranded one records a decision against a retired path.
- Please expire or redrive the stranded row server-side.

## 3. The ingest drop: the stall reproduces at rev 171

**Unchanged from rev 164.** `pcn23-002` stops at `received` after 601 s. On both alice's and bob's queues, no `document_promotion` task names the `ingest_id`.

**What `src/lib/ingestCapture.test.tsx` seals,** now over both captures (rev 164 and rev 171, via `describe.each`):
- the upload reads;
- every status row reads;
- the card keeps polling at `received`, never calling it done;
- both queue summaries name nothing.

The promote and label arms stay `todo`, because there is nothing on the wire for them to read.

**`origin_suggestion: null`** appears on the POST response. Cortex has no reader for it yet. It is wire-asserted only, and the card draws nothing from it.

**⛔ Ask I1, unchanged.** Why does a `received` drop never raise `document_promotion` at fleet `4c3b61a6`? It has failed this way at two consecutive revs.
- Until it is answered, the ingest e2e seal cannot pass `received`.
- A capture that progresses will turn the stall arm red. That red is the signal to seal the remaining hops.

## Still waiting

- **The DMC citation seal.** It waits until `label` = DMC is served on maintenance retrieval citations (see the 2026-10-03 packet).
- **WORKFLOW_CASE against `/cases/{id}`.** It waits until a case route is served.
