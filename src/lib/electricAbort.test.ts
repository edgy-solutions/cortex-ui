/**
 * A SUBSCRIPTION MUST ACTUALLY STOP WHEN THE CALLER STOPS IT.
 *
 * `ShapeStream.subscribe()` returns a closure that does exactly one thing —
 * `subscribers.delete(subscriptionId)` — verified by reading
 * node_modules/@electric-sql/client/dist/index.mjs, not by assuming. It detaches the CALLBACK.
 * The internal long-poll keeps running. `unsubscribeAll()` is no better: it clears subscribers
 * and detaches the visibility/wake listeners and the fetch loop continues.
 *
 * THE BEARER IS BAKED IN AT CONSTRUCTION, so a stream carries one token for its whole life.
 * Put those two facts together and the hourly silent renew becomes a leak: App.tsx's effect
 * re-fires on the new token and starts a fresh stream, the old one is never stopped, and it
 * goes on polling `/electric/shape` until its token expires and then 401s
 * `{"detail":"Token has expired"}` forever — as an unhandled promise rejection, because no
 * retry loop can fix a credential. One permanent orphan per refresh, for the life of the tab.
 *
 * WHY NOTHING CAUGHT IT. The leak does not exist in either state. A test that starts a
 * subscription and asserts it receives rows passes; a test that stops one and asserts it
 * stops receiving rows ALSO passes, because detaching the callback really does stop delivery.
 * The defect is only visible in the move between two tokens, and only from outside the
 * callback — at the transport. Same shape as the hooks crash: the states are both fine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const constructed: Array<{ signal?: AbortSignal; headers?: Record<string, unknown> }> = [];

vi.mock("@electric-sql/client", () => ({
  ShapeStream: class {
    constructor(opts: { signal?: AbortSignal; headers?: Record<string, unknown> }) {
      constructed.push(opts);
    }
    subscribe() {
      // The real one returns a callback-detacher and nothing more. Modelling it as a no-op is
      // the honest mock: if the code under test relies on this to stop polling, it is wrong,
      // and this file exists to say so.
      return () => {};
    }
  },
}));

vi.mock("@/config", () => ({ config: { VITE_API_URL: "https://bff.example" } }));

beforeEach(() => {
  constructed.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the artifact stream is abortable, not merely detachable", () => {
  it("passes a signal, because signal is the ONLY thing that stops the poll", async () => {
    const { startArtifactsSubscription } = await import("./electric");
    startArtifactsSubscription("tok-1");
    expect(constructed).toHaveLength(1);
    expect(
      constructed[0].signal,
      "no AbortSignal — the stream cannot be stopped and will outlive its token",
    ).toBeInstanceOf(AbortSignal);
    expect(constructed[0].signal!.aborted).toBe(false);
  });

  it("ABORTS on cleanup — the assertion the old code could not pass", () => {
    // This is the whole bug in one line. The previous cleanup called `unsubscribe()` and
    // returned, leaving `aborted` false forever.
    return import("./electric").then(({ startArtifactsSubscription }) => {
      const stop = startArtifactsSubscription("tok-1");
      const { signal } = constructed[0];
      stop();
      expect(signal!.aborted).toBe(true);
    });
  });

  it("a TOKEN REFRESH leaves no live stream behind — the transition, not either state", async () => {
    // What a session actually does across the 1h access-token lifespan: effect fires, token
    // changes, effect cleans up and re-fires. Every stream but the newest must be stopped.
    const { startArtifactsSubscription } = await import("./electric");
    const stopFirst = startArtifactsSubscription("tok-1");
    stopFirst(); // React runs cleanup before the re-render's effect
    const stopSecond = startArtifactsSubscription("tok-2");

    expect(constructed).toHaveLength(2);
    expect(constructed[0].signal!.aborted, "the pre-refresh stream is still polling").toBe(true);
    expect(constructed[1].signal!.aborted, "the current stream must stay alive").toBe(false);
    // And the new one carries the NEW credential, not the one that just expired.
    expect(constructed[1].headers).toMatchObject({ Authorization: "Bearer tok-2" });

    stopSecond();
    expect(constructed[1].signal!.aborted).toBe(true);
  });

  it("starts nothing when there is no token, and hands back a callable stop", async () => {
    // Red-proofs the three above: if the guard returned early in every case they would be
    // asserting about a function that never constructs anything.
    const { startArtifactsSubscription } = await import("./electric");
    const stop = startArtifactsSubscription(null);
    expect(constructed).toHaveLength(0);
    expect(() => stop()).not.toThrow();
  });
});

describe("a refused credential is named apart from an outage", () => {
  it("401 and 403 are auth failures; a network fault is not", async () => {
    // They want different remedies and only one of them resolves by waiting, so the code must
    // not describe an expired token as a flaky connection.
    const { isAuthFailure } = await import("./electric");
    expect(isAuthFailure({ status: 401 })).toBe(true);
    expect(isAuthFailure({ status: 403 })).toBe(true);
    expect(isAuthFailure({ status: 500 })).toBe(false);
    expect(isAuthFailure(new Error("network"))).toBe(false);
    expect(isAuthFailure(undefined)).toBe(false);
  });

  it("reads the STATUS, never the message text", async () => {
    // `{"detail":"Token has expired"}` is a server string. Matching on it would break the day
    // the wording changes and would misfire on any body that happens to contain the word.
    const { isAuthFailure } = await import("./electric");
    expect(isAuthFailure(new Error("HTTP Error 401: Token has expired"))).toBe(false);
  });
});
