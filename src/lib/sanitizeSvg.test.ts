import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./sanitizeSvg";

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

describe("sanitizeSvg — parse failure and wrong root", () => {
  it("returns null when the parser reports a parsererror", () => {
    // Unbalanced tags — DOMParser's XML mode reports this as a parsererror document.
    expect(sanitizeSvg(`<svg ${SVG_NS}><rect></svg>`)).toBeNull();
  });

  it("returns null when the root element is not <svg>", () => {
    expect(sanitizeSvg(`<html xmlns="http://www.w3.org/1999/xhtml"><body /></html>`)).toBeNull();
  });
});

describe("sanitizeSvg — the allowlist is a safe SET, not a denylist", () => {
  it("keeps every allowlisted element and drops nothing from a clean tree", () => {
    const svg = `<svg ${SVG_NS}><g><rect id="a" x="0" y="0" width="1" height="1" /><circle id="b" r="1" /></g></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result!.removed).toBe(0);
    expect(result!.svg.querySelector("rect")).not.toBeNull();
    expect(result!.svg.querySelector("circle")).not.toBeNull();
  });

  it("removes <script> and <foreignObject>, one count each, never their descendants' own turn", () => {
    const svg = `<svg ${SVG_NS}>
      <g>
        <rect id="keep" />
        <script>alert(1)</script>
        <foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      </g>
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result!.removed).toBe(2);
    expect(result!.svg.querySelector("script")).toBeNull();
    expect(result!.svg.querySelector("foreignObject")).toBeNull();
    expect(result!.svg.querySelector("#keep")).not.toBeNull();
  });

  it("M5's target: an unlisted element with NO relation to the word 'script' is still removed — proves this is an ALLOWLIST, not {script} as a denylist", () => {
    // <animate> is not "script" and would survive a denylist of ["script"]. foreignObject,
    // named explicitly in the spec's mutant table, is the same proof restated.
    const svg = `<svg ${SVG_NS}><g><animate id="anim" /><foreignObject width="1" height="1" /></g></svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result!.svg.querySelector("animate")).toBeNull();
    expect(result!.svg.querySelector("foreignObject")).toBeNull();
    expect(result!.removed).toBe(2);
  });

  it("the safe set is keyed on the SUBJECT, not the spelling: an XHTML-namespace <use> inside the svg is removed, not kept on its local name alone (I10's target)", () => {
    // Same local name as the allowlisted SVG <use>, but declared under the XHTML namespace via
    // an explicit xmlns override on the element itself — a different subject wearing the same
    // spelling, and namespace-blind code would keep it.
    const svg = `<svg ${SVG_NS}>
      <g>
        <rect id="keep" />
        <use xmlns="http://www.w3.org/1999/xhtml" id="impostor-use" />
      </g>
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result!.svg.querySelector("#impostor-use")).toBeNull();
    expect(result!.svg.querySelector("#keep")).not.toBeNull();
    expect(result!.removed).toBe(1);
  });

  it("the safe set is keyed on the SUBJECT, not the spelling: an XHTML-namespace <g> inside the svg is removed too", () => {
    const svg = `<svg ${SVG_NS}>
      <rect id="keep" />
      <g xmlns="http://www.w3.org/1999/xhtml" id="impostor-g"><rect id="inside-impostor" /></g>
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result).not.toBeNull();
    expect(result!.svg.querySelector("#impostor-g")).toBeNull();
    expect(result!.svg.querySelector("#inside-impostor")).toBeNull();
    expect(result!.svg.querySelector("#keep")).not.toBeNull();
    expect(result!.removed).toBe(1);
  });

  it("the root itself is namespace-checked: an XHTML-namespace element spelled <svg> is not a root this function accepts", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/1999/xhtml"><body /></svg>`)).toBeNull();
  });
});

describe("sanitizeSvg — attributes, on a kept element", () => {
  it("removes an on* attribute, case-insensitively, M4's target", () => {
    const svg = `<svg ${SVG_NS}><rect id="r" onload="alert(1)" OnClick="alert(2)" /></svg>`;
    const result = sanitizeSvg(svg);
    const rect = result!.svg.querySelector("#r")!;
    expect(rect.getAttribute("onload")).toBeNull();
    expect(rect.getAttribute("OnClick")).toBeNull();
  });

  it("removes a style attribute entirely", () => {
    const svg = `<svg ${SVG_NS}><rect id="r" style="fill:red" /></svg>`;
    const result = sanitizeSvg(svg);
    expect(result!.svg.querySelector("#r")!.getAttribute("style")).toBeNull();
  });

  it("removes href/xlink:href pointing off-document, keeps one starting with #, M7's target", () => {
    const svg = `<svg ${SVG_NS}>
      <defs><rect id="hot-001" /></defs>
      <use id="external" href="https://evil.example/x.svg#a" />
      <use id="internal" href="#hot-001" />
      <use id="xlink-external" xlink:href="https://evil.example/y.svg#a" />
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result!.svg.querySelector("#external")!.getAttribute("href")).toBeNull();
    expect(result!.svg.querySelector("#internal")!.getAttribute("href")).toBe("#hot-001");
    expect(result!.svg.querySelector("#xlink-external")!.getAttribute("xlink:href")).toBeNull();
  });

  it("removes href reachable under an ARBITRARY namespace prefix, not just 'href'/'xlink:href' by spelling — I11's target", () => {
    // l: is bound, on this element, to the XLink namespace — the same namespace xlink:href
    // normally uses — but under a prefix the rule must not special-case by name. An
    // attr.name-keyed rule sees the literal string "l:href", matches neither "href" nor
    // "xlink:href", and lets it through.
    const svg = `<svg ${SVG_NS}>
      <defs><rect id="hot-001" /></defs>
      <use id="arbitrary-prefix" xmlns:l="http://www.w3.org/1999/xlink" l:href="https://evil.example/x.svg#a" />
    </svg>`;
    const result = sanitizeSvg(svg);
    const el = result!.svg.querySelector("#arbitrary-prefix")!;
    expect(el.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBeNull();
  });

  it("removes a javascript: value on any attribute, regardless of case or surrounding space", () => {
    const svg = `<svg ${SVG_NS}><rect id="r" fill="  JavaScript:alert(1)  " /></svg>`;
    const result = sanitizeSvg(svg);
    expect(result!.svg.querySelector("#r")!.getAttribute("fill")).toBeNull();
  });

  it("removes url(...) not immediately followed by #, keeps url(#...)", () => {
    const svg = `<svg ${SVG_NS}>
      <rect id="external-url" fill="url(http://evil.example/x.png)" />
      <rect id="internal-url" fill="url(#grad)" />
    </svg>`;
    const result = sanitizeSvg(svg);
    expect(result!.svg.querySelector("#external-url")!.getAttribute("fill")).toBeNull();
    expect(result!.svg.querySelector("#internal-url")!.getAttribute("fill")).toBe("url(#grad)");
  });

  it("attributes are not counted in `removed` — only elements are", () => {
    const svg = `<svg ${SVG_NS}><rect id="r" onload="x" style="y" href="z" /></svg>`;
    const result = sanitizeSvg(svg);
    expect(result!.removed).toBe(0);
  });
});
