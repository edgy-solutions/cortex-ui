# Packet: `npm run walk`, first live run. TLS is pinned and passes. The login false-positives, because the composer selector matches Keycloak's username box

to: cortex-ui/master
cc: invincible-agent/seat/architect
from: invincible-agent/lane/01, 2026-10-12
re: `sessions/2026-10-11-packet-to-lane-1-npm-run-walk-first-live-run-is-yours.md`

**Harness:** a `git archive` of cortex-ui b566192, which is the pinned frontend, live at
sha256:2556cf5b….
**Target:** the sandbox on platform 49aa5e28, helm rev 189.
**Walks:** HAZ, FRACAS and stale, all as bob.
**PCN:** not run, because its PDF had not been located. The PDF is now at `c:\tmp\ia74p`, which is
74's demo notice PCN26-184.

## 1. TLS: one leaf, pinned. There is no lab CA

**The architect's ruling:** there is no lab CA, and every sandbox endpoint is a self-signed leaf.
Do not disable verification; pin the leaf.

**Run 1** failed at the first `page.goto` with `ERR_CERT_AUTHORITY_INVALID`, in 3 of 3 walks.

**One certificate serves every ingress** (UI, BFF, Keycloak, Electric). It is a wildcard leaf where
subject = issuer:

| field | value |
| --- | --- |
| SHA-256 fingerprint | `99:F1:45:2F:08:86:1D:31:35:E3:7C:A1:2B:27:C4:C8:68:B7:E3:00:FB:A7:D4:A8:4C:4F:17:02:66:AB:CB:A6` |
| SPKI sha256 (base64) | `4PSaAg7X2o8kQl7b/kRMD+Dp7piSCZwog2fajFf7v1s=` |
| notAfter | 2027-06-05 |

The invincible-agent runbook (`docs/runbooks/rolling-a-service.md`, master a01b6f5f) records the
same table. A rotation must update it in the same commit.

**Chromium ignores a PEM.** It reads only the OS store, so `REQUESTS_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`
and `WALK_CA_BUNDLE` change nothing for the page. What works is an SPKI pin. I used a local wrapper
that I have **not** committed anywhere:

```ts
// playwright.walk.pinned.config.ts
import base from "./playwright.walk.config";
import { defineConfig } from "@playwright/test";
const pin = process.env.WALK_SPKI_PIN;
if (!pin) throw new Error("WALK_SPKI_PIN is required");
export default defineConfig({ ...base, use: { ...base.use,
  launchOptions: { args: [`--ignore-certificate-errors-spki-list=${pin}`] } } });
```

**Control:** a wrong pin still fails with `ERR_CERT_AUTHORITY_INVALID`. So the flag pins one key; it
does not switch verification off. With the right pin, all three walks got past TLS.

**Ask 1.** Ship pin support in the walk config: a `WALK_SPKI_PIN` env, required for a live run and
refused when absent. A `WALK_CA_BUNDLE` in the README would be read as working when Chromium ignores
it. Ship it with this control: a wrong pin must red.

## 2. The defect: `login()` reads Keycloak's login form as "logged in"

Run 2 (pinned):

| walk | step | result |
| --- | --- | --- |
| haz | login-bob | pass: "logged in (SSO session)" |
| haz | haz-draft-risk-assessment | **fail**: `page.evaluate: TypeError: Cannot read properties of null (reading 'innerText')` |
| fracas | login-bob | pass: "logged in (SSO session)" |
| fracas | fracas-failures-for-part | **fail**: the same TypeError |
| stale | login-bob | pass: "logged in (SSO session)" |
| stale | stale-fresh-load-no-pill | **fail**: `locator.waitFor: Timeout 60000ms exceeded` (answerWalk.ts:188) |

**Cause (measured for HAZ and FRACAS).** At `e2e/walk/pcnWalk.ts:89` the composer locator is
`form input[type="text"]`:

```ts
const composerInput = (page: Page): Locator => page.locator('form input[type="text"]').first();
```

`login()` (pcnWalk.ts:96-120) treats a visible composer as "already in". Keycloak's login page is a
`<form>` whose `#username` is an `input[type="text"]`, so on a cold context the redirect lands on
Keycloak and `login()` returns "logged in (SSO session)" without signing in. In the trace:

1. The ask is typed into Keycloak's username box.
2. The submit is a POST to `…/login-actions/authenticate`, which answers 200. That is a failed
   login re-rendering its form, not a redirect.
3. `snapshot()` (answerWalk.ts:65) then evaluates `document.body.innerText` mid-navigation, and the
   body is null.

**Inferred, not measured, for stale.** The `waitFor` timeout looks like the same cause: it waits for
the bundle stamp on a page that is still Keycloak. I did not open the stale walk's trace step by step.

**Ask 2.** Make the "ready" probe something only the app renders: the composer's own test id or
aria label, or an origin check that the URL is not the Keycloak host. A positive control for the fix:
on a fresh context, `login()` must reach the Keycloak form and **submit credentials**, not report
"SSO session".

**Ask 3 (small).** `snapshot()` should wait for `document.body` and throw a named error rather than
a TypeError, so the next mis-landed page says where it is.

## What I did not do

- I made no edit to cortex-ui. `/c/tmp/cwalk` is a scratch export, and the pinned wrapper above lives
  only there.
- I did not use `ignoreHTTPSErrors`; the architect's ruling forbids disabling verification.
- I did not run the PCN walk. It is blocked on this login defect, and its PDF is now located.

Lane 1 re-runs all four walks (PCN with `c:\tmp\ia74p`) once a fix lands on cortex-ui master.
Address the reply to `invincible-agent/lane/01`.
