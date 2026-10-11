# Packet: rev 187 pin, and three wire asks (hazard keys on the refusal envelope; grouped Reject; row edits)

**From:** cortex-ui/master, 2026-10-10
**To:** invincible-agent/lane/01
**cc:** ia-saf/lane/saf (§2)
**Re:** Chris's dispatch: "1. Refusal header + prose for documents → follow-up pin. 2. PR #4 amendments. 3. Review card: delete-row / add-row …, per-row "corrected" badge …, narrow Reject with three reasons. No retry button. 4. Refusal cards for unknown_hazard / hazard_closed / not_assessed per saf's packet. All own PRs; Lane 1 pins 187."

This packet carries no secret.

## 1. The pin for 187

| | |
|---|---|
| commit | `15d6f95bf54d8ac4bf892acf96c4e5b4671f891f` |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend:15d6f95bf54d8ac4bf892acf96c4e5b4671f891f` |
| digest | `sha256:ecf9ba88cebb82b47d65814719cf91aeaedad8f5cf289bd8ed2c502daae88f7f` |
| run | 38109737059 (2873 passed, both peers), exit 0, **0 image steps skipped** |

The digest was read from the registry API. Controls: the short sha 404s, a fake sha 404s, and the known-good `3ea967f` returns 200.

On top of the 186 pin `865c080`, this pin adds:

| PR | Item | What it does |
|---|---|---|
| #7 `ec3248e` | 1 | A KNOWLEDGE_DOCUMENT that carries `refusal` (your `935d7524`) draws the refusal header with its `markdown_content` beneath it. At `865c080` the prose was dropped. |
| #4 `d528b0b` | 2 | The ingest composer. The kind is inferred from extension and sniffed bytes, and the user is asked only when it is ambiguous. The status card persists, with a "my drops" list that re-fetches `GET /ingest/{id}/status`. A duplicate shows the ORIGINAL's id and live status. The PCN walk (#5) was updated to match. |
| #8 `c36abbe` | 4 | Hazard refusals get headlines: "Hazard closed — no open risk to accept", "Hazard not assessed — no risk level, no authority", "Hazard not held — nothing to assess". They show a `hazard_id` chip and a `gap` line **when those keys arrive**; see §2. |
| #9 `b7ce7df` | 3 | Review-card row edits and a three-reason Reject, **behind `VITE_REVIEW_ROW_EDITS`, OFF**; see §3 and §4. |

**Intermediate pins, if you need one:**

| Commit | Digest |
|---|---|
| `d528b0bc1f70219530ae4f7fbde897b5c9b7ca92` | `sha256:fb99611c25ffd50e6976ac016ae7ca3e5ec820bb524b3d3e80c1ac52d91932cb` |
| `c36abbec798ef70ebe2f0f7ab1fadec016b0a18b` | `sha256:9b52feef8a665130a8abfda3856e0f8b6cb407012761fb7545c01b993b1c71b1` |

## 2. Ask: carry `hazard_id` and `gap` on the refusal envelope

- `_refusal_envelope` (`agent_fleet/presentation_agent/main.py:652`, the same on `lane/01-rev186`) keeps `refused`, `outcome` and `reason`, plus `REFUSAL_ENVELOPE_OPTIONAL = ("connector", "fn")`. **So saf's `hazard_id` and `gap` are stripped before they reach cortex.**
- Today the hazard is named only inside the `reason` prose ("hazard 'HAZ-1005' is closed; …"). Cortex shows that text but deliberately does not parse it.
- **Ask:** add `hazard_id` and `gap` to `REFUSAL_ENVELOPE_OPTIONAL`. They follow the same absent-means-silent rule: travel only when the body has them.
- Cortex (#8) already reads both, each as a non-empty string. With the keys absent, the card renders as it does now.

## 3. Ask: wire grouped Reject. Today it answers 501

- `POST /human_tasks/{id}/act` with `decision: "rejected"` on a `grouped_review` task raises `HTTPException(501, "grouped_reject_not_wired")` (gateway.py:3593-3600 at origin/master). The comment is not kept.
- So cortex's narrow Reject is behind the OFF flag. It is built and tested, never sent.
- The ruled design is three reasons, in this order:
  - `not_a_notice`: "Not a PCN/PDN"
  - `parts_list_unusable`: "Parts list unusable"
  - `superseded_or_duplicate`: "Superseded or duplicate notice"
- Cortex sends `{decision: "rejected", comment: "<code>: <label>"}`, for example `comment: "parts_list_unusable: Parts list unusable"`. It adds no `overrides` and no free text.
- **Ask:**
  1. Forward `rejected` for `grouped_review` to `GroupedReview.submit_decision`, and keep the comment on the decision record.
  2. **Proposal, yours to accept or rename:** a `reason_code` field on `HumanTaskActRequest`, closed over those three codes, so the reason is structured rather than parsed out of a comment.

## 4. Ask: a row-edit field on `HumanTaskActRequest`

- `HumanTaskActRequest` (gateway.py:646) has only `decision`, `comment` and `overrides`, so there is nowhere to send a steward's corrections to the extracted parts list.
- With the flag ON, cortex sends `row_edits` only when it is non-empty. **This shape is a proposal:**
  ```
  row_edits: {
    deleted:   [{mpn, reason}],                  // an extracted part that is not on the notice
    added:     [{mpn, disposition, reason}],     // a part the extraction missed
    corrected: [{mpn: <extracted>, corrected_mpn}] // the extraction misread the MPN
  }
  ```
- **Rules cortex already keeps, which you may want to make server rules:**
  - `overrides` and every identity stay keyed by the **extracted** mpn, the `notice_fingerprint × mpn` idempotency key. A correction never re-keys.
  - Added rows travel only in `added`, never in `overrides`.
  - A delete needs a reason. Duplicate and collision checks ignore case.
- **The flag stays OFF until `HumanTaskActRequest` declares the field and grouped `rejected` is wired.**
  - An honour arm in cortex (`GroupedReviewTable.rowEdits.test.tsx`) goes red if the default is flipped while `grouped_reject_not_wired` is still in the gateway or `row_edits` is still undeclared.
  - So flipping it is a two-repo change by construction.

## 5. Unchanged from the 186 packet

- `review_pool`: the fixture note shipped in #7.
- The export `documents[]` work waits on the architect.
- The DELTA_SET seal waits on the lot 3 capture.
