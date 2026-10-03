/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `ILLUSTRATION`.
 *
 * HAND-BUILT, same as `contract.ts`'s header says: no producer route serves an ICN's bytes
 * today (invincible-agent origin/master 29c80057 — `GET /artifacts/{id}` returns JSON, not
 * bytes, and the IPD fixture carries no graphic), so there is no capture to load. The SVG below
 * is an inline string constant, never read from disk — `node:fs` breaks `vite build`, which
 * `src/lib/noNodeBuiltinsInTheBundle.test.ts` exists to catch.
 */
import type { IllustrationPayload } from "../contract";

export const ILLUSTRATION_ABSENCES = [
  'data-illustration-state="media-unknown"',
  'data-illustration-state="undrawable"',
  'data-illustration-state="unserved"',
  'data-illustration-state="path-refused"',
  'data-illustration-hotspot="none"',
  'data-illustration-hotspot="not-found"',
  'data-illustration-hotspot="ambiguous"',
] as const;

export type IllustrationAbsence = (typeof ILLUSTRATION_ABSENCES)[number];

export interface IllustrationFixture {
  name: string;
  payload: IllustrationPayload;
  declares: IllustrationAbsence[];
}

/**
 * ONE SVG fixture, reused (with a different `hotspot_id` per fixture) by every drawn case.
 * Carries, per the spec's required list:
 *  - "hot-001" and "hot-0010" — the breaking input for a prefix match (M1's target: "hot-0010"
 *    starts with "hot-001");
 *  - "hot-dup", twice — ambiguity;
 *  - a <script>, a <foreignObject>, an element with `onload`, a <use> to an external URL, and a
 *    <use href="#hot-001"> — the sanitizer's own required-removal set (see `sanitizeSvg.test.ts`
 *    for the unit-level proofs; this fixture exercises the same shapes through the card).
 */
export const SVG_FIXTURE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <defs>
    <rect id="hot-001" x="0" y="0" width="10" height="10" />
    <rect id="hot-0010" x="10" y="0" width="10" height="10" />
    <circle id="hot-dup" cx="30" cy="10" r="5" />
    <circle id="hot-dup" cx="40" cy="10" r="5" />
  </defs>
  <rect id="loader" x="50" y="0" width="10" height="10" onload="alert(1)" />
  <script>alert('xss')</script>
  <foreignObject x="0" y="20" width="20" height="20"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
  <use id="external-use" href="https://evil.example/x.svg#a" />
  <use id="internal-use" href="#hot-001" />
</svg>`;

function path(n: number): string {
  return `/ingest/illustrations/icn-${n}`;
}

function icn(n: number): string {
  return `ICN-SANDBOXRTX-A-954000-A${String(n).padStart(5, "0")}-A-001-01`;
}

const DRAWN_FOUND_HOT_0010: IllustrationPayload = {
  icn: icn(1),
  media_type: "image/svg+xml",
  content_path: path(1),
  title: "Sandbox RTX — panel A",
  hotspot_id: "hot-0010",
};

const DRAWN_FOUND_HOT_001: IllustrationPayload = {
  icn: icn(2),
  media_type: "image/svg+xml",
  content_path: path(2),
  title: "Sandbox RTX — panel B",
  hotspot_id: "hot-001",
};

const NOT_FOUND: IllustrationPayload = {
  icn: icn(3),
  media_type: "image/svg+xml",
  content_path: path(3),
  hotspot_id: "hot-missing",
};

const AMBIGUOUS: IllustrationPayload = {
  icn: icn(4),
  media_type: "image/svg+xml",
  content_path: path(4),
  hotspot_id: "hot-dup",
};

const NONE: IllustrationPayload = {
  icn: icn(5),
  media_type: "image/svg+xml",
  content_path: path(5),
  hotspot_id: null,
};

const UNDRAWABLE: IllustrationPayload = {
  icn: icn(6),
  media_type: "image/cgm",
  content_path: path(6),
};

const MEDIA_UNKNOWN: IllustrationPayload = {
  icn: icn(7),
};

const UNSERVED: IllustrationPayload = {
  icn: icn(8),
  media_type: "image/svg+xml",
};

const PATH_REFUSED: IllustrationPayload = {
  icn: icn(9),
  media_type: "image/svg+xml",
  content_path: "https://evil.example/icn.svg",
};

const PART_NUMBER_ONLY: IllustrationPayload = {
  icn: icn(10),
  media_type: "image/svg+xml",
  content_path: path(10),
  hotspot_id: null,
  part: { part_number: "PN-12345" },
};

export const ILLUSTRATION_FIXTURES: IllustrationFixture[] = [
  {
    name: "drawn, hotspot found — hot-0010 (must not also match hot-001)",
    payload: DRAWN_FOUND_HOT_0010,
    declares: [],
  },
  {
    name: "drawn, hotspot found — hot-001 (the reverse case — must not also match hot-0010)",
    payload: DRAWN_FOUND_HOT_001,
    declares: [],
  },
  {
    name: "drawn, hotspot not in the SVG",
    payload: NOT_FOUND,
    declares: ['data-illustration-hotspot="not-found"'],
  },
  {
    name: "drawn, hotspot id shared by two elements",
    payload: AMBIGUOUS,
    declares: ['data-illustration-hotspot="ambiguous"'],
  },
  {
    name: "drawn, no hotspot named",
    payload: NONE,
    declares: ['data-illustration-hotspot="none"'],
  },
  {
    name: "undrawable — image/cgm",
    payload: UNDRAWABLE,
    declares: ['data-illustration-state="undrawable"'],
  },
  {
    name: "media type not stated",
    payload: MEDIA_UNKNOWN,
    declares: ['data-illustration-state="media-unknown"'],
  },
  {
    name: "content_path not served",
    payload: UNSERVED,
    declares: ['data-illustration-state="unserved"'],
  },
  {
    name: "content_path is an absolute URL — refused before fetching",
    payload: PATH_REFUSED,
    declares: ['data-illustration-state="path-refused"'],
  },
  {
    name: "drawn, part carries only part_number",
    payload: PART_NUMBER_ONLY,
    declares: ['data-illustration-hotspot="none"'],
  },
];
