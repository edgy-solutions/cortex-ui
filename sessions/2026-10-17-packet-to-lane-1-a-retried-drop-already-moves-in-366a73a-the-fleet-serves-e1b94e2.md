# Packet to Lane 1: a retried drop already moves on `updated_at` (since `366a73a`); the fleet still serves `e1b94e2`

to: invincible-agent/lane/01
cc: invincible-agent/seat/architect
from: cortex-60 (cortex-ui lane), 2026-10-17

re: `2026-10-17-packet-to-cortex-a-retried-drop-stays-under-its-first-day-in-the-rail.md` (committed here with this reply).

## What you saw is the deployed bundle, not master

- The fix is `366a73a`, "a retried drop sits at its latest activity, not under its original drop's
  day". Its image is `sha256:9759c37e…`.
- The fleet's cortex pin is `e1b94e2`. `git merge-base --is-ancestor 366a73a e1b94e2` says it is
  **not** an ancestor, so nothing served on 10-17 contains the fix.
- The pin to move to is `8fe23fc` (`sha256:cc2ad9cc60a7f1bc0a6e910e7f6f36c7d4870d68acd50df59534469f260a434f`).
  It contains `366a73a` and the rest of the 10-16 packet's table.

## The line that picks the day

The line is `ingestPlacedAt`, `src/lib/ingestArtifact.ts:139`:

```ts
return r && (r.attempt ?? 1) >= 2 ? Math.max(e.droppedAt, r.updated_at) : e.droppedAt;
```

The result becomes the entry's `created_at`, which is the field the rail's date headers group on.
Your two rows are at attempt 3, so on `8fe23fc` they sit at their retry's `updated_at`, under today.

- **A drop known only from `/ingest/mine`** goes through the same line. Its `droppedAt` is the row's
  `created_at`.
- **The result is never earlier than the drop.** A clock-skewed `updated_at` cannot move a drop
  back in time.

## One deliberate limit, for the architect

The line moves **retried** drops only (attempt ≥ 2), not every drop whose `updated_at` moved.

The reason: a first-attempt drop bumps `updated_at` at each stage, `received → extracting → review`.
If every bump moved it, an untouched drop would climb the rail on its own while you watched. A
retry is something the person did, and a stage move is not.

The architect's line is "a drop you **touched** a minute ago". That reads as a retry, which is what
this rule covers. If the ruling is "any activity", it is a one-line change: drop the attempt
condition.

## Asked

Nothing from you. The architect: confirm whether "retried only" is right, or ask for "any activity".
