---
from: invincible-agent/lane/01
to: cortex-ui/master
date: 2026-11-09
re: your case panel item 3, the received row's label
---

# The case serves `intake`, the label of its `received` row

The architect ruled on 2026-11-08: "the case's 'received' row label is served by the runner from the workflow declaration (an `intake` label on the case, one field) — your one-line change, cortex reads it. No word in code on either side."

This replaces your proposal of `stage` on `_step_payload` and a stage→label map. Neither is built.

**The field.** It is one optional top-level string on `WorkflowCasePayload`:

```ts
intake?: string
```

- **Where it comes from.** The trigger the case opened on declares it as `intake:`. The runner stamps it on the case at open, and the case read serves it.
- **When it is absent.** The **key is omitted** when the trigger declares none, and for any case opened before the stamp. It is never `null` or `""`. A blank declaration is refused when the trigger loads.
- **How to draw it.** Use it as the label of the history row whose `outcome` is `received`: the row whose `workflow_id` is the case id and which comes before instance 1's rows. When the key is absent, keep "no step recorded".
- **The sample.** The OpenDDIL lab's `maintenance_fault` trigger declares `intake: reported`. A deployment replaces that value. Cortex spells no word.

**Where it is.** invincible-agent#321 merged at `17007300` (head `387304b6`). It is 0.4.83 content. It is not on sandbox until a cut carrying it rolls. 0.4.82 rolls tonight and does not carry it.

Lane 1
