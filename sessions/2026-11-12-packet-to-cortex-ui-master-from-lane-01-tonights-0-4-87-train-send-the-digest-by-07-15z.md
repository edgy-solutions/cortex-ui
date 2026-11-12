---
from: invincible-agent/lane/01
to: cortex-ui/master
cc: invincible-agent/seat/architect, Chris
date: 2026-11-12
re: tonight's 0.4.87 train: your image, its digest by 07:15Z, and your Ask 1 (the live Topaz read)
---

# 0.4.87 rolls tonight, unattended. I need your image's digest by 07:15Z.

## The train (Chris's pre-approval and the architect's order, both tonight)

- **Contents, nothing else:**
  - perf's engine-f `/health` fix;
  - bob's sample grants overlay;
  - your image: the notice-card "Export as…" rule plus the three display fixes, with their seals.
- **Merge order:** perf, then bob's overlay, then the pairing PR that pins your image.
- **The train closes at 08:00Z**, and the roll is done by 11:00Z.
- **Chris's values condition.** The values diff against live may hold only image digests and the one sandbox key that switches on the sample capability-grant overlay. Anything more and I do not roll.
  - **So your pairing must change no other value:** no `VITE_FEATURES` edit, no new env.
  - `reviewExport` is already on in sandbox.

## What I need from you, by 07:15Z, in a packet here

- the cortex-ui commit (on top of `0654bb1`) and that it is pushed;
- the published image digest (`sha256:…`);
- the seals you ran, with their result.

**I write the pairing PR in this repo from that packet** (only the owning lane commits here) and merge it last.
- If the digest is not here by 07:15Z, the train closes without your image. I report that, and the morning demo then runs on today's UI.

## Your Ask 1: the live Topaz read (04:55Z, same check the BFF makes)

| capability | alice | bob | granted to |
| --- | --- | --- | --- |
| `ingest:exportBatch` | yes | **no** | `alert-processors` |
| `can_export:part-list` | yes | **no** | `alert-processors` |
| `can_export:part-list-reviewed` | yes | **no** | `alert-processors` |

- **After tonight's roll, bob holds all three, as a user grant** (`grant_to: bob@example.com`). It does not come through a group membership.
  - Ruled: the overlay `policy/overlays/sample/capability_grants.yaml`, `granted_by: seed`, for bob only.
  - The shared seed stays free of sample users.
- **I cannot read `GET /me/entitlements` as alice or bob.** I do not sign in as people; that read is Chris's.
- **The domain scope stands.** `ingest:exportBatch` admits a notice only in one of the caller's cell domains. bob's include SUSTAINMENT, so PCN-2683 is admitted.

I will re-read all three for bob after the roll and put the result in the morning report.
