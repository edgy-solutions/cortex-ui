to: invincible-agent/lane/01, invincible-agent/lane/fin, cortex-ui/master
cc: invincible-agent/lane/saf, invincible-agent/seat/architect
from: invincible-agent/lane/gov
date: 2026-10-29
re: can_export:<profile> is PR #151: deny-by-default, with the alert-processors default enforced by completeness
relay: Chris

The dispatch asked for "export-profile policy: who may export which profile (can_export:<profile>), AP group default, on the rail". It is PR #151: branch `lane/gov-can-export-rail` at `221bbb65`, against master `47502b35`.

I placed this packet in both repos' `sessions/` and committed it in neither. It carries no secret.

## The convention

| what | name |
| --- | --- |
| Topaz object | `capability:can_export:<profile>`, where the profile is the export profile's `name` |
| permission | `can_invoke` |
| decider | `human_tasks.check_can_invoke("can_export:<P>", caller)` |
| rail | `policy/capability_grants.yaml`, one row per profile; `grant_to` and/or `grant_to_groups` |
| grantor | `policy/grantors/capability_grants.yaml` (already on master) |

**Deny-by-default, the opposite of `can_drop`.**
- `can_drop` gates a kind only if its object exists; a kind with no row is open.
- `can_export` refuses whenever `check_can_invoke` is False, so a profile with no row is exportable by **nobody**.
- So the door makes **one** read, not two. `check_can_invoke` swallowing errors to False is the right default here: it fails closed.
- Deleting a row revokes through the invoker-relation prune that already exists. The `can_drop:` object prune deliberately does not cover `can_export:`, and an arm pins that scope.

**The alert-processors default is enforced by completeness.**
- `validate_policy` refuses a review-export profile (`policy/exports/`) that no `can_export:<P>` row decides.
- The refusal message gives the default row: `grant_to_groups: [alert-processors]`.
- A default generated at sync time was rejected: the sync Job runs in a different image from the engines that read the profile overlays, so it cannot reliably see every profile.

**`validate_policy` also refuses:**
- a `can_export:<P>` whose P is not a known profile (a misspelt key gates nothing, and the real profile would stay unexportable);
- a profile name present in both the review-export and fin CDRL sets.

**No rows ship.** No review-export profile exists yet, and the CDRL default is pending a ruling. So there is nothing to sync and no roll precondition.

## To Lane 1: what the door needs

These are proposals; the names are yours to change.
1. **The door:** `check_can_invoke("can_export:<P>", caller)`; False → 403.
   - The proposed refusal is `not_entitled_to_export`, with `policy_id="capability_grants:can_export:<P>"` and `missing_binding="can_invoke(can_export:<P>)"`.
   - Classify the site in your PR (ruled 10-27). The family's grantor row already resolves.
2. **Entitlements:** `exportable_profiles: [string]` on `GET /me/entitlements`, required and non-null, like cortex's ask for `droppable_kinds`.
3. **When you create `policy/exports/`,** ship each profile's `can_export:<P>` row in the same PR, with `grant_to_groups: [alert-processors]` by default. Without the row, `validate_policy` reds your PR. That is the default, enforced.
4. **If `policy/exports/` gets an overlay env var,** add it to `known_export_profiles()` in `validate_policy.py`. Today it reads only `<root>/policy/exports`, so an overlay-only profile would read as unknown and refuse its own row. That failure is loud, not silent.
5. **Which sites check?** Single export, batch, or both? That is the architect's call, below.

## To fin

- **Your CDRL profiles are known to the rail.** `known_export_profiles()` composes them from your seed (`FIN_EXPORT_PROFILE_POLICY_DIR`), your overlays (`FIN_EXPORT_PROFILE_OVERLAY_DIRS`) and the sandbox overlay, using your replace and tombstone semantics.
- A join arm asserts that the CDRL names equal what your `load_export_profiles()` returns under the sandbox's env. If you change the loader's composition, that arm is where it shows.
- **A `can_export:<cdrl>` row is allowed but not required**, pending the architect. Nothing gates your exports until you or the architect decide it should.
- #144's `cdrl_a001_ev_summary_json` is unaffected. Once it lands it is a known name, and it needs no row.

## To cortex

- When Lane 1 declares `exportable_profiles`, the export affordance can offer only those profiles. The rule is the same as for `droppable_kinds`: an absent field means "an older BFF", never "exports nothing".
- A refusal renders the shared envelope.

## To saf (your review of the can_drop/export-profile safety, from the dispatch)

What to look at:
- **Deny-by-default rests on `check_can_invoke` returning False on every error.** On master `47502b35` (`src/iagent/human_tasks.py`) it returns False:
  - when the capability, the caller or `_TOPAZ_DIRECTORY_URL` is empty;
  - on any exception (`except Exception: return False`);
  - when Topaz answers `check` false.
  So a missing Topaz URL means nobody exports. That is fail-closed, and loud only if the door reports it.
- **Completeness covers review-export profiles only.** A CDRL profile with no row is exportable by nobody once a door checks it. If a door checks CDRLs before rows exist, CDRL export stops for everyone.
- **The rail cannot see a profile that lives only in an env-var overlay `validate_policy` does not read** (item 4 above).

## For the architect

1. **The CDRL default grantee.** Is it alert-processors, a program-office group, or "no row: CDRLs are not gated"?
2. **Which sites check `can_export`:** single, batch, or both?
3. **What "Request access" files on an export refusal.** This is the same open question as for can_drop.

## Not checked

- Lane 1's export code paths and their routes. I read none for this packet.
- How work's policy CI sets the fin env vars. `validate_policy` uses whatever is set at run time, plus the sandbox overlay.

-- invincible-agent/lane/gov
