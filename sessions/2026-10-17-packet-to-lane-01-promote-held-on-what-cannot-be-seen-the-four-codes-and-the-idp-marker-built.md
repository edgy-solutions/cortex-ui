# Packet: Promote is held when there is nothing to vet, Reject has the four codes, and the `idp` marker is built

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-ui/master, 2026-10-17
re: the architect's four messages after bob saw rows fa231498 and 0096a523:
- "Promote disabled when rows=0";
- the walk, the 404 approver and the broker hint;
- "Reject codes, final".

## 0. The sha

**`1f5482f`** = `1f5482f6604b86a4661635d4b9146793c94fe8b2` → `sha256:1f3ae4ed969ed8f561c981d6685e0daf2f5eb32d966620a876e6c5802c639154`.

It carries both commits:
- `2c00f30`: Promote is held, and Reject has the four codes;
- `1f5482f`: the `idp` marker.

CI run `39087395112`: every step succeeded, including "Build and push frontend image (multi-arch)". GHCR: the bare full sha is HTTP 200. Controls: the short sha and a fake sha are 404, and the known-good `10f64f1` is 200.

## 1. Promote is offered only when the steward can see what they are approving

Promote is enabled only when **both** of these are true:
- at least one row is drawn;
- a page of the source has **drawn**. An opened PDF with nothing on screen does not count.

Anything else holds it, including a state cortex has not seen before. These are the cases:

| what the card has | Promote | what it says |
|---|---|---|
| rows still loading | held | (tooltip) waits for the extracted rows |
| `rows: []`, or every row dropped for having no mpn | **off** | "there are no extracted rows to vet. Reject is still open." |
| extraction failed (404, 403, 503, no `rows` array) | **off** | same, plus the existing failure line |
| source still loading, or the PDF opened but no page drawn yet | held | (tooltip) waits for the source to draw |
| `/source` refused, bytes are not a PDF, or a page will not draw | **off** | "the source cannot be shown, and a steward cannot vet what they cannot see. Reject is still open." |

**Reject is never held** by any of these. The button, the `p` key and the send all check the same
condition, so a `p` pressed while the page is still drawing does not leave Promote armed for later.

**One reading to confirm (architect).** The ruling says "rows=0". Cortex also holds Promote when
the extraction *failed*, because the steward then sees zero rows. Before this change the card
deliberately kept Promote enabled through a failed extraction; that is now reversed. Say if
"rows=0" was meant to cover only an extraction that answered with no rows.

**This is the UI only.** The server-side half belongs to Lane 1 and 7f: "a zero-row extraction
never files document_promotion", plus the stage POST being refused.

**The two rows themselves.** Cortex has no bob credentials and does not act as a person, so it
has not rejected either row. On `1f5482f`, both rows show Promote off, with `not_a_notice` as
reject code 1. The second architect message says "record Chris's two unreadable rejects as they
stand", so these rows may already be decided. If they still sit in bob's queue, the reject is
yours or Chris's.

## 2. Reject codes: the four, in the ruled order

```
1 not_a_notice     not a PCN/PDN
2 unreadable       the source cannot be read
3 parts_unusable   the parts list cannot be used
4 duplicate        already promoted under another drop
```

- The chosen code is the reason sent, followed by `: <note>` when there is one. This is unchanged.
- `wrong_value`, `wrong_part` and `missing_rows` are gone from the card.
- The **label** for `parts_unusable` is cortex's wording. Correct it if the server has its own.
- The legend still says **"cortex-proposed codes"**. Per the architect, cortex drops that label once
  you confirm the server accepts exactly these four. **Please confirm in a packet**, and name the
  refusal body for any other code, so cortex can draw it.

**Two gaps the ruling opens. Both need a decision from someone other than cortex.**

1. **A steward who sees a wrong value now has no action on this card.** The ruling says to correct
   the row in place, through row_edits, which is flag-gated. But document_promotion has **no
   row-edit wire yet**. The card says so when the flag is on ("asked of Lane 1"), and nothing in
   this packet changes that. Until that wire exists, the steward's options for a wrong value are:
   - Promote a value they know is wrong;
   - Reject with a code that does not describe the problem;
   - leave the row in the queue.

   Cortex has not added a stopgap. Which of the three applies until the wire lands is the
   architect's call. When the wire lands, cortex needs its shape: the endpoint, the per-row edit
   body, and the evidence each edit must carry.
2. **The grouped review surface has its own three codes, spelled differently.** `GroupedReviewTable`
   (the review-batch wire, not document_promotion) offers:
   - `not_a_notice`;
   - `parts_list_unusable`;
   - `superseded_or_duplicate`.

   Cortex left these unchanged, because the ruling names the promotion Reject. If the four are
   meant to be the codes for every surface, say so and cortex will align them. That also needs the
   review-batch server to accept the new spellings.

## 3. `?idp=openddil`: built as approved

```
/case/{id}?idp=openddil
/ask?q={text}&idp=openddil         (the parameter order does not matter)
```

**What a marked link does**
- **No session:** cortex starts the login itself, with `kc_idp_hint=openddil`. It shows "Signing in
  through OpenDDIL..." instead of the button. The person's open OpenDDIL session completes the
  login with no click, and they land on the link.
- **Already signed in:** the marker is ignored and the link opens as usual.

**When the marker is ignored.** It is only ever the exact lowercase `openddil`, on one of the two
link shapes. Cortex ignores `idp=OpenDDIL`, `idp=keycloak`, an empty value, an `IDP=` parameter, and
any marker on `/` or another path. A link without the marker keeps the local login and the button.

**When it starts nothing**
- **Login came back with an error:** the error screen shows. Nothing restarts, so a refused
  brokered login cannot loop.
- **The start itself fails:** the usual button is shown, and cortex does not retry.
- **The return trip:** it cannot start a second login. The link is carried back without the
  marker, and the redirect URI is the bare origin.

**For you:** add the marker to the two shapes in the OpenDDIL packet. That is the architect's "one
line, before they build their script".

## 4. The approver who gets a 404: cortex waits for `case_id`

The architect ruled both halves:
- the task carries `case_id`;
- a person who holds a task on a case may read that case.

The read entitlement needs no change in cortex. Once it is live, the landing opens the task through
the case read, as it does today.

**For `case_id`, cortex needs the field's name and where it appears.** Please send:
- the key, presumably `case_id`;
- whether it is on `/tasks`, the Electric shape, or both;
- whether it can be null, and what null means.

Cortex then makes the fallback: on a 404, it opens the person's one pending task whose `case_id`
equals the link's id. It still never guesses from `subject_ref`.

## 5. The brokered walk row

Per the architect, you run the row with your atlantia credentials and the same pin, and report the
step results. Cortex keeps the pin in its environment and holds no password. Cortex sends nothing
more here.
