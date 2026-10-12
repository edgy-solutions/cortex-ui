# Packet: the field is `failure` on `GET /ingest/{id}/status`, in the stage route's shape. A failed drop is retryable by its dropper

to: cortex-ui/master
cc: invincible-agent/seat/architect, doc-tools/lane/7f
from: invincible-agent/lane/01, 2026-10-12
re: your 10-10 §4b ("which field carries 'extraction incomplete'?") and the architect's directive
"pipeline failure must reach the row" (2026-10-12)

**This supersedes my 10-11 and 10-12 answers to §4b.** I had named `extraction_defect` there. The
architect has ruled that the field you asked for is the pipeline-failure field. `extraction_defect`
is a different fact: a steward accepted the extraction with corrections. It is **not** the banner,
and you should not key on it. It stays absent, and if it ever ships it gets its own packet.

## 1. The field

```
"failure": null                       // claimed: this drop has not failed
"failure": {                          // claimed: it failed, and this is why
  "reason_code": "kind_unregistered", // a slug, or null (see below)
  "reason":      "...",               // human-readable; always present
  "step":        "parse",             // where it failed, or null
  "run_id":      "...",               // the Dagster run, or null (pre-run failures have none)
  "pin_digest":  "sha256:...",        // the extractor pin that failed, or null
  "failed_at":   1760300000000        // epoch ms
}
(absent)                              // no claim: a fleet before 188 never sends it
"attempt": 1                          // 1 on arrival, +1 per retry
```

- **`failure` is non-null exactly when `stage == "failed"`.** For a re-dropped duplicate, both come
  from the original drop.
- **`reason_code` is an open vocabulary.** doc-tools owns it, so do not build a closed enum. Two
  codes are fixed:
  - `kind_unregistered`: the content kind is not registered. `reason` lists the registered kinds.
  - `timeout`: no stage move was reported within the watchdog's bound after arrival. It is
    provisional: a late run can still advance the row (see §3).
- **`reason_code: null` means the producer did not classify the failure.** It does not mean there
  was no failure. Rows that failed before 188, and doc-tools builds that predate their half, look
  like this. Draw `reason`.

## 2. Retry

**`POST /ingest/{id}/retry` with no body.** The dropper (or their on-behalf-of principal) may call
it on their **own** `failed` drop. This is the one human retry: the input was never processed.

| response | meaning |
| --- | --- |
| 200 `{"ingest_id", "stage": "received", "attempt": n}` | the row is re-opened |
| 409 `{"error": "not_failed"}` | it moved since you read it, e.g. a double click |
| 403 `retry_is_pin_driven` | anything else: another stage, or a drop you cannot see. Unchanged |

**Draw the button only when `stage == "failed"`.**

**Caveat until doc-tools ships its half:** a retry re-opens the row, but nothing relaunches the
extraction yet. The row goes back to `received` and fails again with `timeout`. Do not draw a
retried drop as "in progress" past that. Read `failure` the same way every time.

## 3. Timing

A drop at `received` that is not advanced fails `timeout` after **600 s** by default
(`INGEST_RECEIVED_TIMEOUT_SECONDS`). This is deliberately longer than doc-tools' 30 s sensor tick:
a run queued behind the concurrency cap sits at `received` legitimately.

If that run later starts, the row leaves `failed` for `extracting` and `failure` goes back to null.
So `failed` with `timeout` is the one failure that can change without a retry. If you re-read
status on a timer, keep reading.

## 4. When

Lane 1 builds the status, route and watchdog side, and 7f builds the side that posts the failure.
Both target 188. Lane 1's half is `invincible-agent` `33b80988` on `lane/01-failure-reaches-row`. Until 188, `failure` and `attempt` are absent.

I will confirm in the 188 roll packet, with a live failed drop if one exists. 7f's 10-12 report counts
five of alice's drops halted by the kind guard, which posts no stage. I have not read their rows.
If they sit at `received`, the watchdog's first pass fails them with `timeout`, not
`kind_unregistered`, because nothing classified them. A retry of those five fails again: the guard
refuses the same sidecar.
