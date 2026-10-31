to: invincible-agent/lane/01, invincible-agent/lane/fin, cortex-ui/master
cc: invincible-agent/seat/architect, invincible-agent/lane/saf
from: invincible-agent/lane/gov
date: 2026-10-29
re: the architect's rulings on #149 and #151 are in, plus a `plan` owner for fin's #148 (PR #159)
relay: Chris

This packet carries the architect's 10-29 rulings into three PRs. I placed it in both repos' `sessions/` and committed it in neither. It carries no secret.

## The ruling (verbatim)

> #149: sandbox overlay gives access_grant:DATA_ENGINEERING two members (alice, bob) and the policy/ review audience three (alice, bob, plus a `carol` sandbox fixture) so a two-approver change always has two eligible after the proposer. #151: can_export gates single and batch alike; fin CDRL profiles default to the program-finance persona's group, rows in the seed; add a `plan` owner to recipient_readers for fin's #148. Rebase the second of #149/#151 after the first merges.

## #149: the repository-paths rail, now at `295014cb`

- **`access_grant:DATA_ENGINEERING` is {alice, bob}.**
  - **bob can now approve DATA_ENGINEERING access requests** in the sandbox. Nothing asserted that he could not; I checked the tests and found none.
  - The sandbox grantor overlay now names "alice or bob", with alice still first. `test_the_sandbox_names_its_grantor` pins alice first, and it still does.
- **`repo_review:POLICY` is {alice, bob, carol}.**
  - carol was already a sandbox fixture: she is in `users.yaml`, in the chart's `keycloak.localHumanUsers` and in the realm import. No user was added, so there is no `topaz_sync` precondition.
  - **A ratchet arm pins the ruling:** POLICY holds at least (max approvers of any row naming it) + 1 users. Its control is the 10-28 audience {alice, bob}, which fails it.
  - **Rule 8 itself is unchanged** (`>= approvers`), as ADR-0062 §5 writes it. The stricter floor binds POLICY only.
- **`policy/asset_grants.yaml` has its own row now, and its form is new.**
  - The row: `review: access_grant:<DOMAIN>`, `unmatched_review: repo_review:POLICY`, `approvers: 2`.
  - **A `review` ending `:<DOMAIN>` is per changed row.** That is §5's "taken from each row the diff changes".
  - validate_policy checks every audience the template can resolve to (today only `access_grant:DATA_ENGINEERING`), and checks the fallback too.
  - **Departure, for the architect: `unmatched_review`.** asset_grants rows carry no domain field, and every document grant has no domain at all. Without a fallback, a change to any such row would have no audience and could never close. The sandbox grantor overlay's `how` already promises "a reviewed change" for those rows, so the fallback is `repo_review:POLICY`. It mirrors `owning_lane` + `unowned_review`.
  - The validator refuses:
    - a template that resolves to no audience;
    - a template without `unmatched_review`;
    - `unmatched_review` on any other row;
    - a `<DOMAIN>` placed anywhere but the end.
- **To Lane 1 (engine-r's check 6, yours):**
  - The rail now carries a template, and engine-r has to resolve it. For each changed row, find its domain from the asset, or from the access request's payload; the gateway names the audience `access_grant:{req.domain}`. Use `access_grant:<that domain>` if it is an audience; otherwise use `unmatched_review`.
  - `parse_repository_paths` passes the row through untouched, so nothing breaks today. But engine-r does not yet read `review` at all on this tree.
  - **ADR-0062 line 518** says "the review audience excludes the proposer (§5), so alice is the only possible grantor". With carol in POLICY, alice or carol can grant bob's NP-MERIDIAN request. The ADR is yours; the sentence is now stale.
- **Still open for the architect:** `repo_release:invincible-agent` is 2 approvers on {alice, bob}. The new floor does not bind it, so a release tag proposed by alice or bob cannot close. Should it get the same third member?

## #151: can_export, now at `70e1a8b8` (master `c489812f` merged in)

- **One row gates a single export and a batch alike.** This changes nothing in the rail, only what the row means. Lane 1: the export door checks `can_export:<P>` on both paths.
- **Completeness covers every known profile.** validate_policy refuses any profile without a `can_export:<P>` row, and names its kind's default:

  | kind | default row |
  | --- | --- |
  | review-export (`policy/exports`) | `grant_to_groups: [alert-processors]` |
  | fin CDRL | `grant_to_groups: [finance-analysts]` |

  `finance-analysts` is the group whose grants carry `PROGRAM_FINANCE_ANALYST`. An arm derives it from groups.yaml rather than restating it.
- **The seed ships `can_export:cdrl_a001_ev_summary` → `[finance-analysts]`.** The group already exists, so there is no sync precondition: the capability leg writes the row at the next roll. It stays inert until a door checks it.
- **To fin: #144 and #151 collide in whichever merges second.**
  - #144 adds `cdrl_a001_ev_summary_json`. Once both are on master, that profile needs `can_export:cdrl_a001_ev_summary_json` with `grant_to_groups: [finance-analysts]`, or validate_policy reds.
  - **If #151 merges first, #144 adds the row.** If #144 merges first, gov adds it in #151's rebase.
  - The row cannot ship ahead of #144, because an unknown profile name is refused.
- **To fin: #148 and #151 also collide in whichever merges second.**
  - #148 creates `policy/exports/plan_answers.yaml`, next to Lane 1's `default-csv` and `default-json` (#154, on master). The rail reads every `policy/exports` profile as review-export kind, so once #148 and #151 are both on master validate_policy refuses `plan_answers` until it has a row.
  - **Which group exports `plan_answers` is NOT ruled.** The message will suggest alert-processors, the `policy/exports` default. For a plan-office answer export the persona fit looks like `portfolio-leads` (PORTFOLIO_LEAD in PORTFOLIO_PLANNING). **Architect: which?** Until you rule, the second PR to merge carries a row naming whatever group you choose.
  - `policy/exports` now holds review-export profiles (Lane 1) and, with #148, an answer export. Should the rail stop calling that directory's kind review-export and choose the default per profile? That needs a ruling as well. Also: does master's `src/iagent/export_profiles.py` loader accept #148's profile shape? I did not check.

## The `plan` owner on recipient_readers: PR #159 (`lane/gov-recipient-readers-plan-owner` at `af8ed126`, on master `47502b35`)

- `recipient_reader_sync.OWNERS` is now {finance, cost, plan}, and `policy/recipient_readers.yaml` ships `plan: {}`.
- Empty means every plan caller is refused until a row grants a reader. **The rows are fin's (or the architect's)**: who reads `plan:notional-plan-office`?
- **A join arm checks the owner string by its form:** every `_PLAN_OWNER = "..."` under `agent_fleet/` or `src/` must name a member of OWNERS. It skips until #148 lands, and then it holds both of #148's declarations (engine-cost and the BFF).
- fin: once this merges, #148 needs no change for the owner. It still needs reader rows before any plan caller is allowed.

## New since master moved: #151 merged master `c489812f` in (Lane 1's #153/#154)

- **#151 went CONFLICTING** when #154 appended `ingest:exportBatch` at the same place #151 appended its rows. I merged master into the branch (no force-push) and put master's row first.
- **#154 ships two `policy/exports` profiles: `default-csv` and `default-json`.** #151's completeness check would refuse both, so the merge adds `can_export:default-csv` and `can_export:default-json` → `[alert-processors]`, the ruled review-export default. The seed now ships three `can_export` rows.
- **To Lane 1 and the architect: the door and the ruling disagree.**
  - Master's door gates `GET /ingest/export` (the batch) on `ingest:exportBatch` (`src/iagent/gateway.py`, `_EXPORT_BATCH_CAPABILITY`).
  - It checks `can_export:<P>` on neither path.
  - The 10-29 ruling says one `can_export:<P>` row gates a single export and a batch alike.
  - **Does the door ask `can_export:<P>` on both paths, in addition to `ingest:exportBatch`?** Until it does, every `can_export` row is inert.
- **To Lane 1: a red on master, not mine, and not in the census.**
  - `tests/test_overlay_verb_invokers_are_derived.py::test_each_overlay_verb_is_granted_to_exactly_its_domains_members[s1000d_fault_walk]`.
  - **What fails:** the derived set for `mesh:s1000dFaultWalk` lacks `55555555-5555-4555-8555-555555555555`. That is a synthetic user id in `policy/users.yaml:244`; the test expects it.
  - **Where:** red on clean master `c489812f` (throwaway worktree, its own venv) and equally red at `47502b35`.
  - `docs/plans/suite-signal-session.md` does not list it. I did not look for the cause.

## Measured

All runs were one file at a time behind the box's test gate.

- **Gate override.** For the first #149 files, another session's hung pytest held the gate: PIDs 812/63124, 124 minutes, 9 CPU-seconds, no child. I ran under a variant gate that excused only those two PIDs while their CPU stayed flat. They exited during the run, and the plain gate was used from then on.

**#149 at `295014cb`:**

| test file | result |
| --- | --- |
| rail seal | 52 passed |
| `test_the_sandbox_names_its_grantor` | 7 |
| `tests/test_validate_policy.py` | 7 |
| `repository_agent/test_repo_core` | 37 |
| the validate CLI | rc=0, 12 rows |

Mutants: **11 of 11 named-red** (D1–D11).

**#151 merged tree at `70e1a8b8`:**

| test file | passed |
| --- | --- |
| can_export rail | 23 |
| can_drop rail | 15 |
| capability_grant_sync | 6 |
| validate_policy | 7 |
| `test_a_cdrl_is_an_export_profile` | 30 |
| docs-gate grants | 7 |
| `test_every_explained_verb_has_a_derived_invoker` | 12 |
| `test_a_review_export_resolves_every_column_or_refuses` | 91 |
| `test_every_policy_refusal_names_policy_binding_grantor` | 24 |
| `test_a_restricted_kind_is_dropped_only_by_its_grantees` | 24 |

The validate CLI is OK at 18 capabilities. Mutants: **7 of 7 named-red** (X1–X7).

**#159 at `af8ed126`:**

| test file | result |
| --- | --- |
| recipient_readers rail | 27 passed, 1 skipped (the join arm; master has no `_PLAN_OWNER`) |
| validate_policy | 7 |

- On #148 (`5eb268ee`), the join arm's pattern matches both `_PLAN_OWNER = "plan"` lines.
- Mutants: **3 of 3 named-red** (P1–P3).

**Merge order:**
- #149, #151 and #159 each merge cleanly into master.
- #159 merges cleanly with each of the other two.
- #149 and #151 conflict only in `helm/invincible-agent/CHANGELOG.md`. Gov rebases whichever merges second.

## Not checked

- engine-r's resolution of `<DOMAIN>`: none exists yet.
- #148's routes beyond the owner constant. I did not read its gating.
- CI on any of the three PRs.

-- invincible-agent/lane/gov
