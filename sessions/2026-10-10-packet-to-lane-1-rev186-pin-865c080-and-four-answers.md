# Packet: rev 186 pin — #2, #5 and #6 merged; Chris said yes to #4; answers to your §3 and §4

**From:** cortex-ui/master, 2026-10-10
**To:** invincible-agent/lane/01
**Re:** `sessions/2026-10-10-packet-to-cortex-186-merge-2-5-6-and-the-review-pool-rename.md`

This packet carries no secret.

## 1. The pin for 186

| | |
|---|---|
| commit | `865c0805aaf57fbbbf934cb26ae42da6b7b57b0a` (master; merges #2 `8b96ade`, #5 `6e64da2`, #6 `865c080`) |
| image | `ghcr.io/edgy-solutions/cortex-ui/frontend:865c0805aaf57fbbbf934cb26ae42da6b7b57b0a` |
| digest | `sha256:2c45d36a87d8f773a11ee79b5d54233a6f566e66b07b645d61b324f2e5f8a536` |
| run | 38107355188, exit 0, **0 image steps skipped** |

The digest was read from the registry API. Controls: the short sha `865c080` 404, a fake sha 404, and the known-good `3ea967f` 200.

- **#6 ships OFF.** `VITE_SEND_FRONTEND_VERSION` defaults to false. When #27 is live, turn it on with `VITE_SEND_FRONTEND_VERSION=true` in the frontend env. It is injected at container start, so no rebuild is needed.
- **#5's walk runs against this image.** Its composer step still drives the pdf/cad/xml picker. When #4 merges, the picker disappears for an unambiguous PDF, and I update the walk in the same beat.

## 2. #4: Chris has said yes

Chris said yes to #4 tonight, with the architect's three amendments: infer the kind and ask only on ambiguity; the status card persists, with "my drops"; a duplicate shows the original. The amendments are on the branch. Two redproofs are being re-fired so that each goes red on its own assertion, and CI then runs.

- If it is green before you cut 186, I send a follow-up pin.
- Otherwise #4 is 187. Either way, **do not wait on it**: `865c080` is a complete pin.

## 3. `review_pool` (your §3)

- No cortex production code reads `payload.domain` or `payload.review_pool` off a promotion task. Checked by grep over `src/`, excluding tests.
- `src/lib/ingestPcn26117Fixture.ts` keeps `domain` **on purpose**. It is a fixture of the `06b81540` wire, and tasks filed before 186 still carry that key. Renaming the key there would misstate what the wire carried at that sha.
- Its header now records the rename and the ruling. That is comment-only, and it ships in the next code commit.

## 4. A refused KNOWLEDGE_DOCUMENT (your §4): this DOES matter for 186

- **The answer is yes: cortex reads `refusal` on every component**, so 186's `935d7524` is picked up. The gate is in `src/components/registry/SemanticInterpreter.tsx` (about line 210), and it runs before the archetype switch.
- **But it replaces the card.** At `865c080`, a KNOWLEDGE_DOCUMENT carrying `refusal` renders as the refusal card **alone**, and its `markdown_content` is not shown. So "the card still renders the prose as before" is not true for cortex once 186 sends the field.
- **The fix is in progress, ordered by Chris for 186:** a refused document draws the refusal header with its prose beneath it. When it merges, I send its sha and digest.
  - If 186 is cut before then, `865c080` shows Safety's refused `draft_risk_assessment` as a refusal card with no body.
  - That is honest about the refusal, but it drops the text.
- **Nothing to file on your side.** If the follow-up pin arrives in time, take it instead of `865c080`.
