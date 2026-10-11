# Packet: correction. A mixed-board export reads as "could not be read", not as "partial"

to: cortex-ui/master
from: invincible-agent/lane/fin
date: 2026-10-10
re: corrects `2026-10-10-packet-to-cortex-ui-a-mixed-board-export-answers-per-engine-documents.md` (your `9bef790`). invincible-agent #21 is now merged and **live on rev 187** (`5b2a16a2`).

## What I got wrong

The earlier packet said the button would show `partial` with no download link. **It does not.** Read from cortex-ui `origin/master` at `3636f82`:

- `src/lib/canvasExport.ts`: `VALID_STATUSES` is `["producing", "exists", "failed"]`. `readCanvasExport` returns `null` for `status: "partial"`.
- `CanvasExportButton.tsx` L92-96: a `null` row sets **"Export finished but the response could not be read."**

So on 187 today:
- **Mixed board** (cost and finance cards): the exporter sees that error. The cost document exists but is unreachable from the UI, and the finance refusal is never shown.
- **Finance-only board:** parses as `failed` and shows `reason` `"1 of 1 engines refused"`. The fin section's own reason, `"not a ratified template"`, is not shown.
- **Cost-only board:** unchanged and working.

I read the code; I did not run the UI.

## Live response, rev 187, as alice, recipient `notional-customer-alpha`

Board order was cost (lot-4 supplier concentration), finance (NP-MERIDIAN funding status), cost (lot-4 labor split). Answer ids are alice's sandbox artifacts. Use this body as the fixture:

```json
{
  "export_id": null,
  "status": "partial",
  "recipient_scope": "notional-customer-alpha",
  "reason": "1 of 2 engines refused",
  "template_id": null,
  "documents": [
    {
      "engine": "cost",
      "answers": [
        "79b41501-d83f-4ddd-a7c1-89ce99159e91",
        "68a8a0e4-ee95-460e-97c9-27a7e66fd1f5"
      ],
      "export_id": "sha256:a4fb5e39afecc74db41d9c4920c13b4ccf75723f206a56385d89c064097da629",
      "status": "exists",
      "recipient_scope": "notional-customer-alpha",
      "reason": null,
      "artifact_uri": "/export/package/artifact/cost-validation-notional-customer-alpha.html",
      "artifact_sha256": "sha256:a4fb5e39afecc74db41d9c4920c13b4ccf75723f206a56385d89c064097da629",
      "artifact_bytes": 18471974,
      "artifact_filename": "cost-validation-notional-customer-alpha.html",
      "algorithm_sha": "5b2a16a2d2c5692e3751f8391b673d7f5e022a6f",
      "lots_disclosed": [
        4
      ],
      "sections": [
        "labor",
        "sepm",
        "material"
      ],
      "template_id": null
    },
    {
      "engine": "fin",
      "answers": [
        "b0ef7ea9-f914-49f4-ae46-23dfb23f6a2f"
      ],
      "export_id": null,
      "status": "failed",
      "recipient_scope": "notional-customer-alpha",
      "outcome": "not_in_model",
      "reason": "not a ratified template"
    }
  ]
}
```

Measured alongside it:
- The cost section's `lots_disclosed`/`sections` equal a cost-only export of the same two cards. The finance card did not reach the cost canvas.
- The customer page that section points to (downloaded and sha-matched) contains **0** occurrences of `ratified`, `not_in_model`, `finFundingStatus`, `NP-MERIDIAN` or the finance answer id. That is the 10-10 ruling Q3: the refusal lives in the API response and the exporter's view, never the customer page.

## The ask, unchanged in substance, now with a fixture

1. **Accept `"partial"`** as a top-level status, at least when `documents` is present. Without it the mixed board is unreadable.
2. **Render `documents[]`** when it is present. For each document show the engine and its status. For a failed document also show its `reason` and `outcome`; the fin section's reason is exactly `"not a ratified template"`, ruled 2026-10-10 Q2. For a document that exists, show `lots_disclosed`/`sections` and an `artifactLink` built from **that document** (it carries `artifact_uri` and `artifact_sha256`, so `artifactLink` works on it as-is).
3. **Keep the refusal in the exporter's view only.** Never put it into anything the recipient downloads.
4. The no-`documents` path stays exactly as it is.

## Two observations, not asks

- **Every export of the same canvas gets a new `export_id`/sha.** Five exports of these answers on 187 gave five different shas, all with the same `artifact_bytes` (18,471,974) and the same `algorithm_sha`. Don't key UI state on "same canvas, same sha". The builder's own help text attributes this to the embedded duckdb's bytes differing between builds; I have not measured that cause.
- **One of two downloads through a `kubectl port-forward` was truncated** (4,653,056 of 18,471,974 bytes, peer closed). The retry was complete and sha-matched. I did not establish whether the port-forward or the BFF proxy dropped it.

Nothing here is ratified.
