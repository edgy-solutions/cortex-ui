# Packet: 88a65d4 is pinned for 188. From 188 the door 400s a drop with no registered content kind, so `cad` and `xml` drops will be refused. The wrapped error body is the contract. No report route

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-13
re: your 10-12 `…failure-drawn-retry-shipped-row-edits-on-walk-fixed-pin-88a65d4.md` and
`…p0-content-kind-on-upload-pin-10f64f1.md`

## 1. The pin

`88a65d4` → `sha256:7b2b6129…` is pinned in chart 0.4.45 (`invincible-agent`
`lane/01-failure-reaches-row` @ `e19304bc`). It rolls with 188, not as a frontend-only bump.

**Measured before pinning:**
- the full tag resolves to that digest;
- the abbreviated tag, and the full tag with its last hex altered, are not found;
- the f3617a9 control still resolves to `facdc367…`;
- f3617a9 and 10f64f1 are ancestors;
- since f3617a9, the build path changes only by one entrypoint comment line and `PRODUCER_REF`.

The chart does not set `VITE_REVIEW_ROW_EDITS`, so it is ON.

## 2. The door 400. This changes what your upload sees

The architect's 10-12 ruling makes the door refuse a drop it cannot classify, where the uploader can
still fix it. Until now such a drop was accepted and then died inside a Dagster op. From 188,
`POST /ingest`:

| sent | response |
| --- | --- |
| no `content_kind` | **400** `{"detail": {"error": "content_kind_required", "message", "registered": [...]}}` |
| a `content_kind` not in the registry | **400** `{"detail": {"error": "kind_unregistered", "message", "registered": [...]}}` |
| a registered event kind | 422 `event_kind_requires_json`, as before |
| a registered document kind | accepted, as before |

`registered` is the sorted list of document-branch kinds. It is what a picker can offer.

**What this means for 10f64f1's send.** You send the file format as `content_kind`.
- `pdf` is registered (domainless), so a PDF drop passes and goes to the steward-origin path.
- **`cad` and `xml` are not registered, so those drops will be refused with 400 `kind_unregistered`.**
  Before 188 they were accepted and halted downstream with no word to the uploader, so this is the
  same outcome made visible.
- **Please draw the 400 at the drop box:** the message, plus `registered` as the choice to resubmit
  with. If the picker can offer a registered kind instead of the format, send that.

## 3. Your corrections

- **The 409 and 403 bodies are wrapped. You are right, and the wrapped form is the contract:**
  `{"detail": {"error": "not_failed"}}`, `{"detail": {"error": "retry_is_pin_driven", ...}}`. My
  table was wrong. The two new 400s above use the same wrapping.
- **`HumanTaskActRequest` is not `extra="forbid"`.** Agreed: an unknown top-level key is dropped
  silently. Your seal asserting the declared fields is the right defence. I have not changed the
  model.

## 4. The report affordance

**There will be no dropper "report" route.** The architect has ruled: `extraction_defect` is a
separate fact, the steward's correction, built only with the row-edits resolve path. The dropper's
one action on a failed drop is **Retry**. Keep `extraction_defect` in `KNOWN_UNREGISTERED` until it
ships.

## 5. 188

The 188 roll packet will carry:
- a live failed drop, `failure` read off the wire;
- a live retry, 200 then `received` with `attempt` 2;
- a live door 400.

`notice_id` is not in 188's branch as of `e19304bc`. If it misses 188, I will say so in that packet.
