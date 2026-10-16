/**
 * The brokered-login screen check against a FAKE Keycloak + fake upstream + fake app (page.route, no
 * real host, no dev server). Each negative case asserts the exact message, not just "it threw".
 */
import { test, expect, type Browser, type Page, type Route } from "@playwright/test";
import { DEFAULT_KC, defaultQuestion, Walk, type WalkConfig } from "./pcnWalk";
import { runBroker } from "./walkBroker";
import type { Env } from "./walkEnv";

const APP = "http://app.walk.test";
const SSO = "http://sso.walk.test";
const UP = "http://upstream.walk.test";

function cfg(): WalkConfig {
  return {
    notice: "PCN26-184",
    expectParts: [],
    pdfPath: "",
    question: defaultQuestion("PCN26-184"),
    baseURL: APP,
    outDir: test.info().outputPath("shots"),
    kc: DEFAULT_KC,
    timeouts: { login: 6_000, drop: 1, stage: 1, promote: 1, promoted: 1, ask: 1 },
  };
}

const html = (route: Route, body: string) => route.fulfill({ status: 200, contentType: "text/html", body });
// A fulfilled 3xx is followed by the network stack, NOT re-routed, so the fakes "redirect" with a script.
const redirect = (route: Route, to: string) => html(route, `<html><body><script>location.replace(${JSON.stringify(to)})</script></body></html>`);

const FORM = (action: string) =>
  `<form method="post" action="${action}"><input type="text" id="username" name="username"><input type="password" id="password" name="password"><input type="submit" id="kc-login" value="Sign in"></form>`;
const KC_PAGE = (withBroker: boolean) =>
  `<html><body><h1>Sign in</h1>${FORM(`${SSO}/login-actions/authenticate`)}${
    withBroker ? `<a id="social-openddil" href="${UP}/realms/openddil/auth?client_id=cortex&state=SECRET">OpenDDIL</a>` : `<a id="social-github" href="#">GitHub</a>`
  }</body></html>`;
const UP_PAGE = `<html><body><h1>OpenDDIL</h1>${FORM(`${UP}/login-actions/authenticate`)}</body></html>`;
const FIRST_LOGIN = `<html><body><h1 id="kc-page-title">Update Account Information</h1><p>review</p></body></html>`;

// The palette stays open after a trigger click (a toggle would hide the items selectPersona re-reads).
const picker = (cells: string[]) => {
  const role = (c: string) => c.split("/")[0];
  const dom = (c: string) => c.split("/")[1];
  return `<div data-pp-trigger data-pp-active-persona="" data-pp-active-domain="" onclick="document.getElementById('pal').style.display='block'">picker</div>
   <div id="pal" style="display:none">${cells
     .map(
       (c) =>
         `<button data-pp-persona="${role(c)}" onclick="var t=document.querySelector('[data-pp-trigger]');t.setAttribute('data-pp-active-persona','${role(c)}');t.setAttribute('data-pp-active-domain','${dom(c)}')">${c}</button>`,
     )
     .join("")}${cells.map((c) => `<span data-pp-domain="${dom(c)}" onclick="document.querySelector('[data-pp-trigger]').setAttribute('data-pp-active-domain','${dom(c)}')">${dom(c)}</span>`).join("")}</div>`;
};
const appBody = (cells: string[]) => `<div data-ingest-composer><form><input type="text"></form></div>${cells.length ? picker(cells) : ""}`;
const appPage = (cells: string[]) => `<html><body>${appBody(cells)}</body></html>`;
// The app's own boot screen: an <h1> that matches the first-login regex ("Link", "verify") for ~1.5 s
// before the composer mounts. Judged on the app's origin it must NOT read as a first-broker-login page.
const appBooting = (cells: string[]) =>
  `<html><body><h1>Linking your identity - verifying entitlements</h1><template id="later">${appBody(cells)}</template>` +
  `<script>setTimeout(function(){document.body.innerHTML=document.getElementById("later").innerHTML},1500)</script></body></html>`;

interface World {
  withBroker?: boolean;
  firstLogin?: boolean;
  appBoots?: boolean;
  cells?: string[];
}

async function world(browser: Browser, w: World): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL: APP });
  const page = await ctx.newPage();
  let authed = false;
  await page.route(/.*/, async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === APP) return authed ? html(route, (w.appBoots ? appBooting : appPage)(w.cells ?? [])) : redirect(route, `${SSO}/realms/cortex/login`);
    if (u.origin === SSO) return u.pathname.includes("first-broker-login") ? html(route, FIRST_LOGIN) : html(route, KC_PAGE(w.withBroker ?? true));
    if (u.origin === UP) {
      if (route.request().method() === "POST") {
        if (w.firstLogin) return redirect(route, `${SSO}/login-actions/first-broker-login?code=SECRETCODE&session_code=abc`);
        authed = true;
        return redirect(route, `${APP}/`);
      }
      return html(route, UP_PAGE);
    }
    return route.abort();
  });
  return { page, close: () => ctx.close() };
}

const ENV: Env = { WALK_ATLANTIA_USER: "operator.atlantia", WALK_ATLANTIA_PASSWORD: "pw-not-real" };

async function run(browser: Browser, w: World, env: Env): Promise<{ err: Error | null; walk: Walk }> {
  const { page, close } = await world(browser, w);
  const walk = new Walk(cfg());
  try {
    const err = await runBroker(walk, page, env).then(
      () => null,
      (e: Error) => e,
    );
    return { err, walk };
  } finally {
    await close();
  }
}

test("broker: link present -> upstream -> back in the app with a cell -> every step passes", async ({ browser }) => {
  const { err, walk } = await run(browser, { cells: ["OPERATOR/AVIATION"] }, ENV);
  expect(err, err?.message).toBeNull();
  expect(walk.results.map((r) => `${r.step}:${r.status}`)).toEqual([
    "creds-atlantia:pass",
    "broker-screen:pass",
    "broker-upstream:pass",
    "broker-first-login:pass",
    "broker-cell:pass",
  ]);
  expect(walk.results.at(-1)!.detail).toContain("OPERATOR");
});

test("broker: WALK_ATLANTIA_CELL offered -> selected and read back", async ({ browser }) => {
  const { err, walk } = await run(browser, { cells: ["OPERATOR/AVIATION"] }, { ...ENV, WALK_ATLANTIA_CELL: "OPERATOR/AVIATION" });
  expect(err, err?.message).toBeNull();
  expect(walk.results.at(-1)!.detail).toBe("atlantia answers as OPERATOR/AVIATION");
});

test("broker: no broker link -> the named error, with the provider links that ARE there", async ({ browser }) => {
  const { err, walk } = await run(browser, { withBroker: false }, ENV);
  expect(err?.message).toContain("walk: brokered login: the Keycloak page offers no broker link (#social-openddil)");
  expect(err?.message).toContain("social-github");
  expect(walk.results.at(-1)).toMatchObject({ step: "broker-screen", status: "fail" });
});

test("broker: a first-broker-login Update Account Information page -> named error, path only, no query", async ({ browser }) => {
  const { err } = await run(browser, { firstLogin: true }, ENV);
  expect(err?.message).toContain('Keycloak showed "Update Account Information" at /login-actions/first-broker-login');
  expect(err?.message).toContain("openddil-first-login must not ask to review or link");
  expect(err?.message).not.toContain("?");
  expect(err?.message).not.toContain("SECRET");
});

test("broker: the app offers no cell -> landed with no cell", async ({ browser }) => {
  const { err, walk } = await run(browser, { cells: [] }, { ...ENV, WALK_ATLANTIA_CELL: "OPERATOR/AVIATION" });
  expect(err?.message).toBe("walk: operator.atlantia landed with no cell (offered: none)");
  expect(walk.results.at(-1)).toMatchObject({ step: "broker-cell", status: "fail" });
});

test("broker: WALK_ATLANTIA_CELL not offered -> error naming the offered cells", async ({ browser }) => {
  const { err } = await run(browser, { cells: ["OPERATOR/AVIATION"] }, { ...ENV, WALK_ATLANTIA_CELL: "SAFETY_ENGINEER/SUSTAINMENT" });
  expect(err?.message).toContain("walk: operator.atlantia is not offered SAFETY_ENGINEER/SUSTAINMENT");
  expect(err?.message).toContain("roles: OPERATOR; domains: AVIATION");
});

test("broker: missing WALK_ATLANTIA_PASSWORD -> names the variable, never a value", async ({ browser }) => {
  const { err, walk } = await run(browser, { cells: ["OPERATOR/AVIATION"] }, { WALK_ATLANTIA_USER: "operator.atlantia" });
  expect(err?.message).toContain("creds: missing environment variable WALK_ATLANTIA_PASSWORD");
  expect(err?.message).not.toContain("operator.atlantia");
  expect(walk.results.map((r) => r.step)).toEqual(["creds-atlantia"]);
});

test("broker: the app's own boot heading reads 'Linking ... verifying' -> NOT a first-login page (judged off the app origin only)", async ({ browser }) => {
  const { err, walk } = await run(browser, { cells: ["OPERATOR/AVIATION"], appBoots: true }, ENV);
  expect(err, err?.message).toBeNull();
  expect(walk.results.find((r) => r.step === "broker-first-login")).toMatchObject({ status: "pass" });
});
