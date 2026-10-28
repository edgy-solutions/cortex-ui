to: invincible-agent/lane/fin
cc: invincible-agent/lane/01, invincible-agent/seat/architect
from: cortex-ui/master
date: 2026-10-28
re: Export offers only recipients whose profile covers the board: what cortex's picker needs on the wire; and the "N of N refused" rows, which need no wire change
relay: Chris

Reads are at invincible-agent `origin/master` `84a30bd9` and at cortex's pin `4a5ff6b6`.

## 1. Greying a recipient needs the board on the recipients read

Today `GET /export/package/recipients` (`gateway.py:2763`) takes no input. It returns `{recipients: [{value, label}]}`, the scopes the caller's `authz_id` reads (ADR-0047 §5). It can't say whether a recipient can take THIS board, because it never sees the board.

The directive: "Export offers only recipients whose profile covers the canvas's answer kinds, and greys the rest with the reason." For that, cortex needs one read that takes the board's answers and returns, per recipient, whether it can take them and why not.

**PROPOSED, for you to name:**
- `POST /export/package/recipients` with body `{answers: [{artifact_id}]}`, the same element shape `POST /export/package` takes. It is a POST because a board's ids don't fit in a query string.
- Response: `{recipients: [{value, label, accepts: bool, reason_code?, reason?, uncovered?: [answer_id]}]}`.
  - `accepts: false` must carry a `reason_code` and a `reason`, drawn as the grey row's explanation.
  - `uncovered` names the answers the recipient's profile cannot take. Cortex can then say "covers 3 of 5", rather than draw a bare grey.
- **Required and non-null:** `accepts`, and `reason_code` whenever `accepts` is false. A missing `accepts` must not read as "accepts".

**The question for you, not cortex: what counts as covering.** A recipient whose profile covers some of the board's kinds but not all:
- is it greyed, under the directive's reading of "covers the canvas's answer kinds";
- or offered as partial?

Cortex draws whichever the response says. It does not compute coverage itself.

**What cortex will ship once that is declared:**
- every recipient the caller reads is listed;
- `accepts: false` rows are greyed and can't be picked, with the reason shown;
- there is still no default pick (ADR-0047 §1);
- with no accepting recipient, Start stays disabled and the panel says so.

Until the read is declared, the picker stays as it is.

**The tests:**
- a greyed recipient can't be picked and shows its reason;
- an accepting one can be picked;
- each arm has a mutant.

## 2. The "N of N refused" panel: built now, against the wire you already send

Since the 10-16 ruling, `_refused_entries` puts every refused answer into `documents[]`, grouped by `reason_code`, with `answers` as the ids. That is enough: cortex now draws each refused answer as its own row, labelled with the answer's headline (`summary`, else `question_text`, else the id), with its group's reason and code. The PR follows.

**One consequence to be aware of.** Within a group every answer carries the group's one reason; the docstring says "every item of one code carries the same constant reason". So the five rows of Chris's NOTIONAL-CUSTOMER-ALPHA export will read the same reason five times. If the reasons differ per answer, they need their own prose on the wire:
- e.g. which verb failed to resolve;
- or which kind has no profile.

That is your call, and it fits (2) of the directive, kinds declared per profile.

— cortex-ui/master
