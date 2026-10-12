/**
 * login() / snapshot() / WALK_SPKI_PIN against a FAKE Keycloak, no dev server needed.
 *
 * The defect (packet 2026-10-12): the "app ready" locator was `form input[type="text"]`, which also
 * matches Keycloak's #username, so login() called a login page "logged in (SSO session)" and never
 * submitted. Here the app origin first answers with a fake Keycloak page; login() must SUBMIT.
 */
import { test, expect, type Browser, type Page, type Route } from "@playwright/test";
import { DEFAULT_KC, defaultQuestion, login, type WalkConfig } from "./pcnWalk";
import { snapshot } from "./answerWalk";
import { spkiPinArg } from "./walkEnv";

const APP = "http://app.walk.test";
const SSO = "http://sso.walk.test";

function cfg(login = 8_000): WalkConfig {
  return {
    notice: "PCN26-184",
    expectParts: [],
    pdfPath: "",
    question: defaultQuestion("PCN26-184"),
    baseURL: APP,
    outDir: test.info().outputPath("shots"),
    kc: DEFAULT_KC,
    timeouts: { login, drop: 1, stage: 1, promote: 1, promoted: 1, ask: 1 },
  };
}

const html = (route: Route, body: string, status = 200) => route.fulfill({ status, contentType: "text/html", body });
// A fulfilled 3xx is followed by the network stack, NOT re-routed, so the fake "redirects" with a script.
const redirect = (route: Route, to: string) => html(route, `<html><body><script>location.replace(${JSON.stringify(to)})</script></body></html>`);

const KC_FORM = (action: string, extra = "") =>
  `<html><body><h1>Sign in</h1>${extra}<form method="post" action="${action}">
   <input type="text" id="username" name="username"><input type="password" id="password" name="password">
   <input type="submit" id="kc-login" value="Sign in"></form></body></html>`;
const APP_PAGE = `<html><body><div data-ingest-composer><form><input type="text"></form></div></body></html>`;
const SYNC_PAGE = `<html><body><button onclick="location.href='/synced'">Synchronize Identity</button></body></html>`;

type Mode = "authed" | "sso-click" | "kc-form" | "kc-bad-password";
interface Fake {
  posts: string[];
}

async function fakeWorld(browser: Browser, mode: Mode, sameOrigin = false): Promise<{ page: Page; fake: Fake; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL: APP });
  const page = await ctx.newPage();
  const fake: Fake = { posts: [] };
  let authed = mode === "authed";
  const sso = sameOrigin ? APP : SSO;
  await page.route(/.*/, async (route) => {
    const u = new URL(route.request().url());
    const isKc = u.origin === sso && (u.pathname.startsWith("/realms") || u.pathname.startsWith("/login-actions"));
    if (isKc) {
      const action = `${sso}/login-actions/authenticate`;
      if (route.request().method() === "POST") {
        fake.posts.push(route.request().postData() ?? "");
        if (mode === "kc-bad-password") return html(route, KC_FORM(action, `<span id="input-error">Invalid username or password.</span>`));
        authed = true;
        return redirect(route, `${APP}/`);
      }
      return html(route, KC_FORM(action));
    }
    if (u.origin === APP) {
      if (u.pathname === "/synced") {
        authed = true;
        return redirect(route, "/");
      }
      if (authed) return html(route, APP_PAGE);
      if (mode === "sso-click") return html(route, SYNC_PAGE);
      return redirect(route, `${sso}/realms/cortex/login`);
    }
    return route.abort();
  });
  return { page, fake, close: () => ctx.close() };
}

test("login: the app shows Keycloak first -> the form is SUBMITTED (not mistaken for the app)", async ({ browser }) => {
  const { page, fake, close } = await fakeWorld(browser, "kc-form");
  try {
    const got = await login(page, cfg(), "bob@example.com", "not-a-real-password");
    expect(fake.posts, "the fake Keycloak must have seen a POST").toHaveLength(1);
    expect(fake.posts[0]).toContain("username=bob%40example.com");
    expect(got).toBe("logged in via Keycloak form");
  } finally {
    await close();
  }
});

test("login: Keycloak on the APP's OWN origin (only the app-only selector tells them apart) -> still SUBMITTED", async ({ browser }) => {
  const { page, fake, close } = await fakeWorld(browser, "kc-form", true);
  try {
    const got = await login(page, cfg(), "bob@example.com", "not-a-real-password");
    expect(fake.posts, "the fake Keycloak must have seen a POST").toHaveLength(1);
    expect(got).toBe("logged in via Keycloak form");
  } finally {
    await close();
  }
});

test("login: already authenticated -> says so; Sync click with no form -> SSO session", async ({ browser }) => {
  const a = await fakeWorld(browser, "authed");
  try {
    expect(await login(a.page, cfg(), "u", "p")).toBe("already authenticated");
    expect(a.fake.posts).toEqual([]);
  } finally {
    await a.close();
  }
  const s = await fakeWorld(browser, "sso-click");
  try {
    expect(await login(s.page, cfg(), "u", "p")).toBe("logged in (SSO session)");
    expect(s.fake.posts).toEqual([]);
  } finally {
    await s.close();
  }
});

test("login: Keycloak re-shows the form after submit -> fails fast naming it", async ({ browser }) => {
  const { page, fake, close } = await fakeWorld(browser, "kc-bad-password");
  try {
    const err = await login(page, cfg(), "bob@example.com", "wrong").then(
      () => null,
      (e: Error) => e,
    );
    expect(err, "a failed login must throw").not.toBeNull();
    expect(err!.message).toMatch(/login: Keycloak re-showed the form after submit/);
    expect(err!.message).not.toContain("wrong");
    expect(fake.posts).toHaveLength(1);
  } finally {
    await close();
  }
});

test("snapshot: a page that is not the app is a NAMED error, not a TypeError", async ({ browser }) => {
  const { page, close } = await fakeWorld(browser, "kc-form");
  try {
    await page.goto(`${SSO}/realms/cortex/login`);
    const wrongOrigin = await snapshot(page, APP, 500).then(() => null, (e: Error) => e);
    expect(wrongOrigin?.message).toMatch(/^snapshot: not on the app \(url http:\/\/sso\.walk\.test\//);
    // On the app's own origin but with no <body> (an SVG document): still named.
    const ctx = page.context();
    const xml = await ctx.newPage();
    let serveXml = true;
    await xml.route(/.*/, (r) => (serveXml ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }) : html(r, APP_PAGE)));
    await xml.goto(`${APP}/x.svg`);
    const noBody = await snapshot(xml, APP, 500).then(() => null, (e: Error) => e);
    expect(noBody?.message).toMatch(/^snapshot: not on the app \(url http:\/\/app\.walk\.test\/x\.svg\)/);
    // And the app itself still snapshots.
    serveXml = false;
    await xml.goto(`${APP}/`);
    expect((await snapshot(xml, APP, 500)).tileIds).toEqual([]);
  } finally {
    await close();
  }
});

test("WALK_SPKI_PIN: right pin -> the exact arg; absent or malformed -> throws naming it, never the value", () => {
  const pin = "4PSaAg7X2o8kQl7b/kRMD+Dp7piSCZwog2fajFf7v1s=";
  expect(spkiPinArg({ WALK_SPKI_PIN: pin })).toBe(`--ignore-certificate-errors-spki-list=${pin}`);
  const two = `${pin}, ${pin}`;
  expect(spkiPinArg({ WALK_SPKI_PIN: two })).toBe(`--ignore-certificate-errors-spki-list=${pin},${pin}`);
  expect(() => spkiPinArg({})).toThrow(/WALK_SPKI_PIN/);
  expect(() => spkiPinArg({ WALK_SPKI_PIN: "   " })).toThrow(/WALK_SPKI_PIN/);
  for (const bad of ["not-a-pin-AAAA", pin.slice(0, 43), `${pin},oops`, "99:F1:45:2F:08:86:1D:31:35:E3:7C:A1:2B:27:C4:C8"]) {
    let msg = "";
    try {
      spkiPinArg({ WALK_SPKI_PIN: bad });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/WALK_SPKI_PIN: malformed/);
    expect(msg).not.toContain(bad);
  }
});
