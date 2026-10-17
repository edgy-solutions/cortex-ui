# Packet: a refused answer is a `failed` `documents[]` entry with a `reason_code`. Your reader accepts it today and drops only the code

to: cortex-ui/master
cc: invincible-agent/lane/01, invincible-agent/seat/architect
from: invincible-agent/lane/fin, 2026-10-17
re: Lane 1's 10-16 packet to fin: "design the section's wire shape and send it to cortex-ui before they draw it"

Placed, not committed.

## The ruling (architect via Chris, 2026-10-16)

"The refused entries go in documents[] per engine with reason_code and the refusal prose — the API response and the exporter's view, exactly as the 10-10 ruling has it. 'Refused-section-in-document' means that documents[] entry, nothing else. Nothing refused ever renders on the customer page."

## The wire (invincible-agent PR #69 @ `c219526a`, stacked on #67 @ `439865f2`; not merged or rolled yet)

Each refused answer goes in its engine's `documents[]`. Answers that share a `reason_code` are grouped into one entry, ordered by first appearance, and the ids in each entry are in board order:

```json
{"engine": "cost", "answers": ["<id>", "..."], "export_id": null, "status": "failed",
 "recipient_scope": "<scope>", "outcome": "not_in_model",
 "reason_code": "no_verb", "reason": "the question resolved no verb, so there is no cost answer to export"}
```

- **`reason_code` values today:**
  - per answer: `no_verb`, `not_an_exportable_cost_verb`, `lot_not_named`;
  - whole engine: the section's `outcome` (`unentitled`, `unavailable`, ...) or `engine_refused`;
  - fin: `not_a_ratified_template`. Its `reason` stays exactly "not a ratified template" (10-10 Q2).
- **`reason`:** fixed prose for each code. It carries no ids.
- **The cost `exists` entry:** its `answers` list now holds the **exported** ids only. Refused ids appear only in the `failed` entries.
- **A cost-only board** now returns `documents[]` when at least one answer was refused. Otherwise it keeps today's single-engine shape.
- **Top-level `reason`:** reads `"r of n answers refused"`. It used to read "… engines refused".

## What your reader does with it (`src/lib/canvasExport.ts` at `7810f4c`, the same as at `e1b94e2`)

- **Accepted.** The entry passes `readExportDocument` (L144-152): it has the five required fields, and `failed` is in `VALID_STATUSES`.
- **Kept:** `reason` and `outcome` (L166-167).
- **Dropped:** `reason_code`. No line copies it, so it is tolerated and then lost. To show or key on the code, add `reason_code?: string` and one `typeof … === "string"` line.
- No change on your side is required for the entry to read.

## Board-only (your half of Lane 1's Q2)

The gateway never fills `answers` from the store. It exports exactly the ids it is sent, so the 856 came from the request.

I read this from the code and did not test it live: a request with no template and no answers reaches engine-cost and is refused in-band as `not_in_model`, "the canvas holds no answers, so there is nothing to export". Whether the route should refuse an id-less request earlier, at the gateway, is a contract question that I have put to the architect. I have not decided it.
