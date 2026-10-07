/**
 * ILLUSTRATION — behavioral assertions against the real fixtures, through the real registry.
 * `@/api/client` is mocked per spec §4 ("Tests mock that module with `vi.mock`").
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { archetypePackage } from "../registry";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { fetchIllustrationContent } from "@/api/client";
import { ILLUSTRATION_FIXTURES, SVG_FIXTURE } from "./fixtures";

// Partial mock: the registry arms mount SemanticInterpreter, whose import graph needs the REST of
// the client. Only the illustration fetch is replaced, and its default is a promise that never
// settles, so a test that forgets to stub it sees "loading", never a crash read as a verdict.
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  fetchIllustrationContent: vi.fn(() => new Promise<string>(() => {})),
}));

const mockFetch = fetchIllustrationContent as unknown as Mock;

// Every test starts with the fixture SVG served; a test that wants another answer stubs its own.
beforeEach(() => {
  mockFetch.mockImplementation(() => Promise.resolve(SVG_FIXTURE));
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => Promise.resolve(SVG_FIXTURE));
});

const pkg = archetypePackage("ILLUSTRATION")!;
const Card = pkg.Card;

const [
  DRAWN_HOT_0010,
  ,
  NOT_FOUND,
  AMBIGUOUS,
  NONE,
  UNDRAWABLE,
  MEDIA_UNKNOWN,
  UNSERVED,
  PATH_REFUSED,
  PART_NUMBER_ONLY,
] = ILLUSTRATION_FIXTURES;

async function settle(container: ParentNode) {
  await waitFor(() => {
    const el = container.querySelector('[data-archetype="ILLUSTRATION"]');
    const state = el?.getAttribute("data-illustration-state");
    expect(state).not.toBe("loading");
    // "drawn" is an attribute committed in RENDER, but the SVG (and the hotspot highlight it
    // carries) is appended by a PASSIVE effect that runs after that commit. Stopping at "not
    // loading" raced it: CI on d7d6593 saw hotspot "found" with ZERO highlighted elements. So a
    // drawn card is settled only once its SVG is actually in the canvas.
    if (state === "drawn") expect(el?.querySelector("[data-illustration-canvas] svg")).not.toBeNull();
  });
}

describe("the card renders through the registry, not a direct import", () => {
  it('archetypePackage("ILLUSTRATION") resolves and draws', async () => {
    expect(pkg).toBeTruthy();
    const { container } = render(<Card illustration={DRAWN_HOT_0010.payload} />);
    expect(container.querySelector('[data-archetype="ILLUSTRATION"]')).not.toBeNull();
    await settle(container);
  });
});

describe("absent or malformed payload — never throws", () => {
  it("no illustration prop at all renders the absence note", () => {
    const { container } = render(<Card />);
    expect(container.querySelector("[data-illustration-absent]")).not.toBeNull();
  });

  it("a non-object illustration prop renders the absence note", () => {
    const { container } = render(<Card illustration="not an object" />);
    expect(container.querySelector("[data-illustration-absent]")).not.toBeNull();
  });
});

describe("the four static states never fetch — M2's target: media-unknown treated as SVG", () => {
  it("media_type absent — media-unknown, no fetch", () => {
    const { container } = render(<Card illustration={MEDIA_UNKNOWN.payload} />);
    const el = container.querySelector('[data-illustration-state="media-unknown"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("did not say what format this is");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("media_type present and not SVG — undrawable, no fetch", () => {
    const { container } = render(<Card illustration={UNDRAWABLE.payload} />);
    const el = container.querySelector('[data-illustration-state="undrawable"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("image/cgm");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("content_path absent — unserved, no fetch", () => {
    const { container } = render(<Card illustration={UNSERVED.payload} />);
    expect(container.querySelector('[data-illustration-state="unserved"]')).not.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("content_path refused by the gateway-path guard — path-refused, no fetch", () => {
    const { container } = render(<Card illustration={PATH_REFUSED.payload} />);
    const el = container.querySelector('[data-illustration-state="path-refused"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("not a gateway path");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("hotspot matching is exact, never a prefix or a first-match fallback", () => {
  it("not-found: zero candidates highlights nothing (M6's target)", async () => {
    const { container } = render(<Card illustration={NOT_FOUND.payload} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="not-found"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-hotspot-highlighted]")).toHaveLength(0);
    expect(container.textContent).toContain("is not in");
  });

  it("ambiguous: two candidates highlights nothing (M8's target)", async () => {
    const { container } = render(<Card illustration={AMBIGUOUS.payload} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="ambiguous"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-hotspot-highlighted]")).toHaveLength(0);
    expect(container.textContent).toContain("none highlighted");
  });

  it("none: hotspot_id absent names no hotspot", async () => {
    const { container } = render(<Card illustration={NONE.payload} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="none"]')).not.toBeNull();
    expect(container.textContent).toContain("names no hotspot");
  });

  it("found: exactly one candidate is highlighted, by exact id equality", async () => {
    const { container } = render(<Card illustration={DRAWN_HOT_0010.payload} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="found"]')).not.toBeNull();
    const highlighted = container.querySelectorAll("[data-hotspot-highlighted]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].getAttribute("id")).toBe("hot-0010");
    expect(container.textContent).toContain("Hotspot hot-0010");
  });
});

describe("a missing part field is OMITTED, never rendered as 'unknown' (M9's target)", () => {
  it("a part with only part_number shows just that field", async () => {
    const { container } = render(<Card illustration={PART_NUMBER_ONLY.payload} />);
    await settle(container);
    const line = container.querySelector("[data-illustration-part]");
    expect(line).not.toBeNull();
    expect(line!.textContent).toContain("PN-12345");
    expect(line!.textContent?.toLowerCase()).not.toContain("unknown");
  });

  it("no part at all renders no part line", () => {
    const { container } = render(<Card illustration={MEDIA_UNKNOWN.payload} />);
    expect(container.querySelector("[data-illustration-part]")).toBeNull();
  });
});

describe("drawn — sanitized content is imported, and the removal count is shown", () => {
  it("the fixture SVG's script and foreignObject are removed, counted once each", async () => {
    const { container } = render(<Card illustration={DRAWN_HOT_0010.payload} />);
    await settle(container);
    const canvas = container.querySelector("[data-illustration-canvas]");
    expect(canvas).not.toBeNull();
    expect(canvas!.querySelector("script")).toBeNull();
    expect(canvas!.querySelector("foreignObject")).toBeNull();
    const removedEl = container.querySelector("[data-illustration-sanitized-removed]");
    expect(removedEl).not.toBeNull();
    expect(removedEl!.getAttribute("data-illustration-sanitized-removed")).toBe("2");
    expect(removedEl!.textContent).toContain("2 element(s) removed for safety");
  });
});

describe("fetch failure and unparseable content each get their own state", () => {
  it("a rejected fetch with an HTTP status shows fetch-failed with the status", async () => {
    mockFetch.mockImplementation(() => Promise.reject({ response: { status: 404 } }));
    const { container } = render(<Card illustration={DRAWN_HOT_0010.payload} />);
    await settle(container);
    const el = container.querySelector('[data-illustration-state="fetch-failed"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("404");
  });

  it("non-SVG / unparseable content shows unparseable, not drawn", async () => {
    mockFetch.mockImplementation(() => Promise.resolve("not xml at all <<<"));
    const { container } = render(<Card illustration={DRAWN_HOT_0010.payload} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-state="unparseable"]')).not.toBeNull();
  });
});

describe("the SemanticInterpreter dispatches ILLUSTRATION through the registry", () => {
  it("an envelope {archetype: ILLUSTRATION, illustration: ...} renders the card, not the not-found panel", async () => {
    render(
      <SemanticInterpreter
        payload={{
          components: [
            {
              archetype: "ILLUSTRATION",
              illustration: DRAWN_HOT_0010.payload,
            },
          ],
        }}
      />,
    );
    expect(document.querySelector('[data-archetype="ILLUSTRATION"]')).not.toBeNull();
    expect(screen.queryByText(/UI COMPONENT NOT FOUND/)).toBeNull();
  });

  it("an envelope with NO illustration object does not draw the card (and does not throw)", () => {
    render(<SemanticInterpreter payload={{ components: [{ archetype: "ILLUSTRATION" }] }} />);
    expect(document.querySelector('[data-archetype="ILLUSTRATION"]')).toBeNull();
  });
});
