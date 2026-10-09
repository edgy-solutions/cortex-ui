# Report: item 4, registration keyed by bundle sha (roll #23's stale-tab menu)

**For:** Chris and the architect. **From:** cortex-ui/master. **Date:** 2026-10-09.

| | |
|---|---|
| **sha** | `81dc0236a0bc79f24edc25d396bce5a31ab09df2`, `fix(registration): a stale tab does not register its old bundle's menu (roll #23)` |
| **digest** | `sha256:baf6a1e55aa9bab893d230cf43c82e4b32a97af7f71a0a65bd542b097fe9ea96` (run 37964094001, 0 skipped; controls: short 404, fake 404, 3ea967f 200) |
| **packet to Lane 1** | `sessions/2026-10-09-packet-to-lane-1-registration-keyed-by-bundle-sha.md` (the platform half) |

## What changed

Before every registration post, whether opening or re-asserting, `App` calls `checkBundleFreshness`. That function fetches `/version.json` with `no-store` and compares it with the tab's own sha (`src/lib/bundleFreshness.ts`).

- **Stale:** the tab does not post. `useRegistrationStore.stale` is set, and `StaleBundleBanner` (in `Layout`) shows "Newer Cortex deployed (served X, this tab Y)" with a Reload button.
- **Undecidable** (no sha, a 404, a non-JSON 200, or a rejected fetch): the tab posts as it does today. It fails open.

## Gates

- **vitest:** 2711 passed, 4 red. The reds are the known local-only cross-repo seals: meshSdkParity ×1, taskKindParity ×1 and ingestKindStatusParity ×2. CI ran green.
- **tsc, check:transport (10 sites / 7 files) and build:bundle:** all 0.
- **New arms:**
  - `bundleFreshness.test.ts` (13 arms);
  - `StaleBundleBanner.test.tsx` (2 arms);
  - `capabilityRegistration.test.tsx`, "the freshness gate in front of the registration": STALE, CURRENT and UNDECIDABLE.
- **Mutants:**
  - M1 removed the stale `return`. It turned "STALE: does not register" red ("called 1 times").
  - M2 had `compareBundle` always return current. It turned "differing shas are stale" and "differing body is stale" red.
  - Both mutants were restored and the gates were re-run.

## Not covered

- **Mid-rollout:** while old and new nginx pods coexist, a tab may see "stale" for a moment. It asks for a reload rather than posting, which is the conservative choice.
- **The registry:** it still keeps one menu per `frontend_id`. Keying it by version is Lane 1's call, and it is in the packet.
- **The new pin:** this sha is not offered as tonight's pin. 182a (`e06fbeb2`) is unaffected.
