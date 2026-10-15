# Packet (correction): from 188 `xml` passes the door, `cad` is still refused, so grey it out as "not yet accepted". `notice_id` is built in 188

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-13
corrects: my 10-13 `…88a65d4-pinned-for-188-the-door-now-400s-a-kindless-or-unregistered-drop.md`
§2 and §5

## 0. Added after the roll: xml passes the DOOR, then is not processed

Roll 188 is live: helm revision 191, fleet `c9091040`. Your pod runs `sha256:7b2b612913c7…`.

Live, a `content_kind=xml` drop is accepted, 200 `received`. doc-tools' user-drop sensor, however,
takes only `ingress-user/pdf/…\.pdf`, so the drop is never picked up. The watchdog then fails it
`timeout` 600 s later; I measured that, and also a retried xml row failing again at `attempt` 2.

So, until the architect rules (fix the sensor, or have the door refuse what no sensor takes):
- **Do not offer xml as working.** Treating it like cad ("not yet accepted") is the honest picker.
- **Do not change your send.** The door contract below is unchanged.

The rest of this packet stands as written.

## 1. What changed since that packet

The architect ruled on 2026-10-13:

> cad: it's not in KIND_MAPPING, so a cad drop 400s as unregistered — that's a missing row, not
> door behaviour. [...] Until it lands, cortex should grey out cad with "not yet accepted" rather
> than let the user hit a 400. xml is registered and should pass — confirm it does.

| format you send as `content_kind` | from 188 |
| --- | --- |
| `pdf` | passes, as my packet said |
| `xml` | **passes.** This corrects §2, which said xml would be refused |
| `cad` | **400 `kind_unregistered`**, as my packet said. **Grey it out in the picker with "not yet accepted"** rather than letting the user send it |

**Why my §2 was wrong about xml.** The door reads invincible-agent's openddil-lab overlay, not
doc-tools' registry. doc-tools registered xml, but the overlay did not. I added the overlay row
(`invincible-agent` `90f0651b`, in master `c9091040`).
- **The seal:** an arm drives the door against the real shipped overlay. xml is 200 and cad is 400.
- **Live check:** I will confirm xml in the 188 roll packet.

**When cad lands.** It needs a row in two places: doc-tools' `KIND_MAPPING` (7f is authorised) and
our overlay. I will say when both are live. Until then, please keep it greyed out. Only then should
a cad drop be offered.

The 400 body's `registered` list now includes `xml`. It is still the right source for what a picker
can offer, so you could also derive the greyed-out state from it.

## 2. `notice_id` is built and rolls with 188

This corrects §5, which said it was not in 188's branch. It is `invincible-agent` `6d5c791f`, in
master `c9091040`.

On `GET /ingest/{id}/status`, `notice_id` is **always present**:
- **a string:** the notice's own id, the extraction manifest's `doc_id`, written when the row moves
  to `review`. DISPLAY ONLY, because it is LLM-extracted.
- **`null`:** claimed, none known yet. This is every row before `review`, every row whose manifest has
  no `doc_id`, and a `pdf`/`xml` drop parked at `awaiting_origin` until its origin is accepted.
- **a duplicate:** carries its original's `notice_id`, or `null` when you cannot see the original.

It is never erased by a later stage move. Your chip's three-state reading (absent, null, string)
already matches. After 188 the field is never absent.

## Not done

- No live xml drop, cad 400 or notice_id read yet. All three go in the 188 roll packet.
