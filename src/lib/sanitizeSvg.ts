/**
 * `sanitizeSvg` — turns server-supplied SVG text into a DOM tree safe to import and draw,
 * by ENUMERATING THE SAFE SET of element names and attribute shapes rather than denying a list
 * of dangerous ones. A denylist is total only over the forms its author already thought of
 * (`<script>`, `onload=...`); a new or unlisted form — `<foreignObject>`, `<animate>`, a
 * `style` attribute carrying a `url(javascript:...)` background — passes a denylist silently.
 * The allowlist below is closed: anything not named is removed, by construction.
 *
 * The safe set is keyed on the SUBJECT, not the spelling: an element only counts as (say) `use`
 * when it is ALSO in the SVG namespace, not merely spelled "use" — an XHTML-namespace `<use>` or
 * `<g>` smuggled into the document is a different subject wearing the same local name, and the
 * allowlist must not be fooled by the spelling. The same reasoning applies to `href`: the rule
 * is about the ATTRIBUTE'S IDENTITY (`localName === "href"`), not its serialized spelling, so an
 * attribute declared under an arbitrary namespace prefix (`l:href` bound to the XLink namespace,
 * or anything else) is still caught.
 *
 * The caller imports the returned root with `document.importNode`, never via `innerHTML` — see
 * `Card.tsx`.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "defs",
  "symbol",
  "use",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "pattern",
  "marker",
]);

/** The one SVG local name that is case-sensitive in the allowlist above (`clipPath`), so the
 *  comparison is against `localName` as parsed, never lower-cased first. Namespace-checked too:
 *  an element spelled like an allowed name but living in some OTHER namespace (XHTML smuggled
 *  into an SVG document, say) is a different subject and is not kept on the strength of its
 *  spelling alone. */
function isAllowedElement(el: Element): boolean {
  return el.namespaceURI === SVG_NS && ALLOWED_ELEMENTS.has(el.localName);
}

/** True when `raw` (trimmed, lower-cased) contains "javascript:" anywhere, or contains
 *  "url(" anywhere NOT immediately followed by "#". */
function isDangerousAttributeValue(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v.includes("javascript:")) return true;
  let from = 0;
  for (;;) {
    const at = v.indexOf("url(", from);
    if (at === -1) return false;
    if (v[at + 4] !== "#") return true;
    from = at + 4;
  }
}

/** Removes every attribute the spec forbids from one already-kept element. Attributes are not
 *  counted (only removed elements are). The href rule keys on `attr.localName`, the attribute's
 *  identity, not `attr.name` (its serialized spelling) — a namespace-declared `href` reachable
 *  under ANY prefix (`l:href`, `xlink:href`, or an unprefixed `href`) is the same subject and
 *  must be caught the same way; keying on the spelling lets an unanticipated prefix through. */
function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) {
      el.removeAttribute(name);
      continue;
    }
    if (lower === "style") {
      el.removeAttribute(name);
      continue;
    }
    if (attr.localName === "href") {
      if (!attr.value.startsWith("#")) {
        el.removeAttribute(name);
        continue;
      }
    }
    if (isDangerousAttributeValue(attr.value)) {
      el.removeAttribute(name);
      continue;
    }
  }
}

/** Walks `el`'s element children (a live walk, so each removal is observed once and only once),
 *  removing anything off the allowlist WITH its subtree, and counting one per removed element —
 *  never its descendants, which never get their own turn through this function. */
function walkChildren(el: Element, removed: { count: number }): void {
  for (const child of Array.from(el.children)) {
    if (!isAllowedElement(child)) {
      child.remove();
      removed.count += 1;
      continue;
    }
    cleanAttributes(child);
    walkChildren(child, removed);
  }
}

export interface SanitizedSvg {
  svg: SVGSVGElement;
  removed: number;
}

export function sanitizeSvg(text: string): SanitizedSvg | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const root = doc.documentElement;
  if (!root || root.namespaceURI !== SVG_NS || root.localName !== "svg") return null;

  cleanAttributes(root);
  const removed = { count: 0 };
  walkChildren(root, removed);

  return { svg: root as unknown as SVGSVGElement, removed: removed.count };
}
