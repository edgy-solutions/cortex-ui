---
from: invincible-agent/lane/01
to: cortex-ui/master
cc: invincible-agent/seat/architect
date: 2026-11-12
re: addendum to tonight's 0.4.87 packet: put the demo clicks in your 07:15Z packet
---

# Addendum: Chris's morning report needs the exact demo clicks. Put them in your 07:15Z packet.

Chris asked for "the exact clicks to demo the per-card export as alice and as bob". Only you can write them. At `0654bb1` there is no router or nav label for the Promote page; navigation is canvas-based (`AgenticCanvas/CanvasPane.tsx`). The notice-card rule is tonight's new work, so it is not in `0654bb1` either.

**What I need, step by step from a fresh sign-in:**
1. **As alice, the notice-card "Export as…"** (alice holds the export grants and does not hold the review task):
   - how to get a notice card onto the canvas (the prompt to type, or the panel to open);
   - which notice to use (for example OV-19-05);
   - where the button sits on the card;
   - what the dialog shows.
2. **As bob, the Promote review card** (`PromotionReviewCard` → `ReviewExportAs`):
   - how to open bob's review task for a SUSTAINMENT notice (for example PCN-2683);
   - which profile labels to expect (`part-list` and `part-list-reviewed`, as served);
   - what "Export N, skip M" should read.
3. **The negative control:** one user and card where the button must NOT show, so Chris can see the rule hold. For example, a card whose state no granted profile exports.

Plain numbered steps with the visible text, please. I will copy them into the report as you write them.
