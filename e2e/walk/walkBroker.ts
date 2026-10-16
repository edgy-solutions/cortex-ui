/**
 * The BROKERED login screen check: operator.atlantia signs in by clicking the `openddil` identity
 * broker on the Keycloak login page, authenticating at the upstream (OpenDDIL) form, and coming back.
 * Facts from invincible-agent docs/reference/identity-mint-contract.md: the first-broker-login flow
 * `openddil-first-login` has review-profile and every link/verify step DISABLED, so a correct brokered
 * login returns straight to the app. "Lands with cell" = the PersonaPicker offers at least one cell.
 *
 * Everything is read through the page UI. No request context, no TLS bypass (the SPKI pin is a launch flag).
 * Phases are separate functions so each is one named walk step: broker-screen, broker-upstream,
 * broker-first-login, broker-cell.
 */
import type { Page } from "@playwright/test";
import { Walk, COMPOSER_INPUT_SELECTOR, selectPersona, type WalkConfig } from "./pcnWalk";
import { creds, type Env } from "./walkEnv";
import { WALK_PERSONAS } from "./walkPersona";

export const DEFAULT_BROKER_SELECTOR = "#social-openddil";

const originOf = (u: string): string | null => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};
/** The URL path only: a query string can carry codes and state, so it never reaches a message. */
const pathOf = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return "(unparseable)";
  }
};

const upstreamSel = (env: Env, cfg: WalkConfig) => ({
  user: env.WALK_UPSTREAM_USERNAME_SELECTOR || cfg.kc.user,
  password: env.WALK_UPSTREAM_PASSWORD_SELECTOR || cfg.kc.password,
  submit: env.WALK_UPSTREAM_SUBMIT_SELECTOR || cfg.kc.submit,
});
const brokerSel = (env: Env) => env.WALK_KC_BROKER_SELECTOR || DEFAULT_BROKER_SELECTOR;

function appOrigin(cfg: WalkConfig, env: Env): string {
  const o = originOf(cfg.baseURL || env.WALK_BASE_URL || "");
  if (!o) throw new Error("walk: brokered login: no app origin to compare against (set cfg.baseURL or WALK_BASE_URL)");
  return o;
}

const appReady = async (page: Page, origin: string): Promise<boolean> =>
  originOf(page.url()) === origin && (await page.locator(COMPOSER_INPUT_SELECTOR).first().isVisible().catch(() => false));

/** a) "/" -> the Keycloak login page, then b) the broker link must be on it. */
export async function brokerScreen(page: Page, cfg: WalkConfig, env: Env = process.env): Promise<string> {
  const origin = appOrigin(cfg, env);
  const sel = brokerSel(env);
  await page.goto("/");
  const syncBtn = page.getByRole("button", { name: /synchronize identity/i });
  const kcUser = page.locator(cfg.kc.user);
  const link = page.locator(sel).first();
  const deadline = Date.now() + cfg.timeouts.login;
  let clickedSync = false;
  while (Date.now() < deadline) {
    if (await appReady(page, origin)) {
      throw new Error("walk: brokered login: the app was already authenticated, so the Keycloak broker screen was never shown (use a fresh context)");
    }
    if ((await kcUser.isVisible().catch(() => false)) || (await link.isVisible().catch(() => false))) break;
    if (!clickedSync && (await syncBtn.isVisible().catch(() => false))) {
      clickedSync = true;
      await syncBtn.click();
    }
    await page.waitForTimeout(250);
  }
  if (!(await link.isVisible().catch(() => false))) {
    const seen = await page
      .locator('[id^="social-"], #kc-social-providers a')
      .evaluateAll((els) => els.map((e) => `${e.id || "(no id)"}="${(e.textContent ?? "").trim().slice(0, 40)}"`))
      .catch(() => [] as string[]);
    throw new Error(
      `walk: brokered login: the Keycloak page offers no broker link (${sel}); provider links seen: ${seen.join(", ") || "none"} (path ${pathOf(page.url())})`,
    );
  }
  return `broker link ${sel} is on the Keycloak login page`;
}

/** c) click the broker, fill the upstream form with WALK_ATLANTIA_*, submit. */
export async function brokerUpstream(page: Page, cfg: WalkConfig, c: { user: string; password: string }, env: Env = process.env): Promise<string> {
  const sel = upstreamSel(env, cfg);
  const before = page.url();
  // Bounded: an absent link must fail here with a named error, never hang to the test timeout.
  await page.locator(brokerSel(env)).first().click({ timeout: 5_000 }).catch((e: Error) => {
    throw new Error(`walk: brokered login: could not click the broker link (${brokerSel(env)}): ${e.message.split("\n")[0]}`);
  });
  const user = page.locator(sel.user);
  const deadline = Date.now() + cfg.timeouts.login;
  // The Keycloak page also has #username: wait until we have LEFT it before trusting the field.
  while (Date.now() < deadline) {
    if (page.url() !== before && (await user.isVisible().catch(() => false))) break;
    await page.waitForTimeout(250);
  }
  if (!(await user.isVisible().catch(() => false)) || page.url() === before) {
    throw new Error(`walk: brokered login: the broker click did not reach an upstream login form (${sel.user}) within ${cfg.timeouts.login} ms (path ${pathOf(page.url())})`);
  }
  await user.fill(c.user);
  await page.locator(sel.password).fill(c.password);
  await page.locator(sel.submit).click();
  return `upstream form submitted (path ${pathOf(page.url())})`;
}

const HEADING_SELECTOR = "h1, #kc-page-title";
const FIRST_LOGIN_HEADING = /update account|account already exists|link|verify/i;

/** d) the next page must be the app, not a first-broker-login review/link/verify page. */
export async function brokerFirstLogin(page: Page, cfg: WalkConfig, env: Env = process.env): Promise<string> {
  const origin = appOrigin(cfg, env);
  const sel = upstreamSel(env, cfg);
  const deadline = Date.now() + cfg.timeouts.login;
  let formSince = 0;
  while (Date.now() < deadline) {
    if (await appReady(page, origin)) return "back in the app with no review, link or verify page";
    const formUp = await page.locator(sel.user).isVisible().catch(() => false);
    if (formUp) {
      formSince ||= Date.now();
      if ((await page.locator('#input-error, [id^="input-error"], .alert-error').first().isVisible().catch(() => false)) || Date.now() - formSince > 5_000) {
        throw new Error("walk: brokered login: the upstream re-showed its login form after submit (bad credentials?)");
      }
    } else {
      formSince = 0;
      const heading = ((await page.locator(HEADING_SELECTOR).first().textContent({ timeout: 500 }).catch(() => null)) ?? "").trim().replace(/\s+/g, " ");
      const p = pathOf(page.url());
      // Only judged OFF the app's origin: a heading in the app itself is never a first-login page.
      const offApp = originOf(page.url()) !== origin;
      if (offApp && (/first-broker-login/.test(p) || (/login-actions/.test(p) && heading) || FIRST_LOGIN_HEADING.test(heading))) {
        throw new Error(
          `walk: brokered login: Keycloak showed "${heading || "(no heading)"}" at ${p} instead of the app - openddil-first-login must not ask to review or link`,
        );
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`walk: brokered login: the app did not become ready within ${cfg.timeouts.login} ms after the upstream submit (path ${pathOf(page.url())})`);
}

/** e) the persona x domain cell: at least one offered; with WALK_ATLANTIA_CELL=ROLE/DOMAIN, that exact one, selected. */
export async function brokerCell(page: Page, env: Env = process.env, timeoutMs = 20_000): Promise<string> {
  const none = "walk: operator.atlantia landed with no cell (offered: none)";
  const trigger = page.locator("[data-pp-trigger]").first();
  if (!(await trigger.waitFor({ state: "visible", timeout: timeoutMs }).then(() => true, () => false))) throw new Error(none);
  const attrs = (s: string, a: string) => page.locator(s).evaluateAll((els, x) => els.map((e) => e.getAttribute(x) ?? ""), a);
  await trigger.click();
  await page.locator("[data-pp-persona]").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  const personas = await attrs("[data-pp-persona]", "data-pp-persona");
  const domains = await attrs("[data-pp-domain]", "data-pp-domain");
  if (personas.length === 0 && domains.length === 0) throw new Error(none);
  const offered = `roles: ${personas.join(", ") || "none"}; domains: ${domains.join(", ") || "none"}`;
  const want = (env.WALK_ATLANTIA_CELL ?? "").trim();
  if (!want) return `operator.atlantia is offered ${offered}`;
  const m = /^([^/\s]+)\/([^/\s]+)$/.exec(want);
  if (!m) throw new Error("walk: WALK_ATLANTIA_CELL must be ROLE/DOMAIN (malformed)");
  const [, role, domain] = m as unknown as [string, string, string];
  if (!personas.includes(role)) throw new Error(`walk: operator.atlantia is not offered ${role}/${domain} (offered ${offered})`);
  // Leave the palette as we found it: selectPersona opens it itself.
  await page.keyboard.press("Escape").catch(() => undefined);
  return selectPersona(page, { user: "atlantia", role, domains: [domain], login: "brokered" }, timeoutMs);
}

/** The whole row as walk steps. Creds come from creds("atlantia") only; a missing var fails naming it. */
export async function runBroker(walk: Walk, page: Page, env: Env): Promise<void> {
  const who = WALK_PERSONAS.broker.user;
  let c: { user: string; password: string } | null = null;
  await walk.step(page, `creds-${who}`, async () => {
    c = creds(who, env);
    return `WALK_${who.toUpperCase()}_USER and WALK_${who.toUpperCase()}_PASSWORD are set`;
  });
  await walk.step(page, "broker-screen", () => brokerScreen(page, walk.cfg, env));
  await walk.step(page, "broker-upstream", () => brokerUpstream(page, walk.cfg, c!, env));
  await walk.step(page, "broker-first-login", () => brokerFirstLogin(page, walk.cfg, env));
  await walk.step(page, "broker-cell", () => brokerCell(page, env));
}
