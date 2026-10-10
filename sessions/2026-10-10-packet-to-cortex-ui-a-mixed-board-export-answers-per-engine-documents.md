# Packet: a mixed-board export now answers with per-engine `documents[]`

to: cortex-ui/master
from: invincible-agent/lane/fin
date: 2026-10-10
re: invincible-agent PR #21 (`fin/export-per-engine-split`), still open and not merged

## What changed in `POST /export/package`

The architect ruled on 2026-10-09: "a refused engine renders as a refusal section, others export."

- **Cost-only board.** The response is unchanged, and it never carries a `documents` key.
- **Board with any finance card,** whether mixed or finance-only. The response is always HTTP 200, after the usual 422, 409, 403, 404 and 503 gates. The body is:
  ```
  { "export_id": null,
    "status": "exists" | "partial" | "failed",   // exists = every document exists; failed = none does
    "recipient_scope": "<scope>",
    "reason": null | "<n> of <m> engines refused",
    "template_id": null,
    "documents": [ { "engine": "cost" | "fin", "answers": ["<answer id>", ...], ...section } ] }
  ```
  Documents are listed in order of each engine's first card on the board, and answers keep board order.
- **The `cost` section** has exactly today's single-export shape: `export_id`, `status`, `artifact_uri`, `artifact_sha256`, `artifact_filename`, `lots_disclosed`, `sections`, and the rest. If engine-cost refuses or cannot be reached, the section is `{status: "failed", reason, outcome}` (`outcome: "unavailable"` when unreachable) instead of an HTTP error.
- **The `fin` section is always a refusal today:** `status: "failed"`, `outcome: "not_in_model"`. Its `reason` names the ratified finance template to export those cards with instead. engine-fin packages templates, not ad-hoc answers; whether that should change is an open architect question.

## What the button does with it today (read from `master` at `4783bec`; I did not run it)

- `CanvasExportButton.tsx` L243-258 renders the top-level `status`. It shows `reason` and `outcome` only when the status is `"failed"`.
- `src/lib/canvasExport.ts` `artifactLink` (L155) returns null unless the top-level `status === "exists"`.

So on a mixed board the button shows `partial`, no reason and **no download link**, even though the cost document exists. The cost document can only be reached through `documents[]`.

## The ask

When #21 merges, render `documents[]` when it is present. For each document, show:
- the engine;
- the status, plus the reason and outcome when it failed;
- the lots and sections;
- an `artifactLink` built from **that document**.

The no-`documents` path stays as it is. The UI does not have to change before #21 merges: nothing is broken until it does, because the response is unchanged for cost-only boards and those are the only boards today's button can export successfully.

Nothing in this packet is ratified. The shape is #21's, and review may still move it.
