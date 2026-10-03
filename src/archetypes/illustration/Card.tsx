import { useEffect, useRef, useState } from "react";
import { fetchIllustrationContent } from "@/api/client";
import { gatewayRelativePath } from "@/lib/illustrationPath";
import { sanitizeSvg, type SanitizedSvg } from "@/lib/sanitizeSvg";
import type { IllustrationPart, IllustrationPayload } from "./contract";

/**
 * ILLUSTRATION — cortex-proposed (see `contract.ts`'s header: no producer route serves this
 * shape yet). Draws an S1000D ICN, fetched as text and sanitized into a DOM tree, with at most
 * one hotspot element highlighted by exact id match.
 *
 * Every hook below runs on EVERY render, absent payload or not — the absent-payload early
 * return is a render-time branch taken AFTER the hooks, never a return placed before them. A
 * component that calls useState/useEffect conditionally breaks React's hook-order contract the
 * moment a payload arrives on a second render.
 */
export interface IllustrationProps {
  illustration?: unknown;
}

type StaticState = "media-unknown" | "undrawable" | "unserved" | "path-refused";
type FetchPhase = "loading" | "drawn" | "fetch-failed" | "unparseable";
type CardState = StaticState | FetchPhase;
type HotspotState = "none" | "found" | "not-found" | "ambiguous";

interface HotspotResult {
  state: HotspotState;
  text: string;
}

function isIllustrationPayload(v: unknown): v is IllustrationPayload {
  return typeof v === "object" && v !== null && typeof (v as { icn?: unknown }).icn === "string";
}

/** The four "never fetches" states, in the order the spec's table lists them. Returns null when
 *  none apply — the caller then knows it is clear to fetch. */
function computeStaticState(p: IllustrationPayload): StaticState | null {
  if (p.media_type === undefined || p.media_type === null) return "media-unknown";
  if (p.media_type !== "image/svg+xml") return "undrawable";
  if (p.content_path === undefined || p.content_path === null) return "unserved";
  if (gatewayRelativePath(p.content_path) === null) return "path-refused";
  return null;
}

/** Built only from the fields the producer actually sent — a missing field is OMITTED, never
 *  rendered as the word "unknown" (M9's target). No part at all means no line. */
function buildPartLine(part: IllustrationPart | null | undefined): string | null {
  if (!part || typeof part !== "object") return null;
  const fields: string[] = [];
  if (part.part_number) fields.push(part.part_number);
  if (part.manufacturer_code) fields.push(part.manufacturer_code);
  if (part.item) fields.push(part.item);
  if (part.figure_number) fields.push(part.figure_number);
  if (fields.length === 0) return null;
  return fields.join(" · ");
}

/** Exact match ONLY: `getAttribute("id") === hotspotId`. No prefix, no CSS selector (which would
 *  also match a compound id via escaping rules), no case-fold. M1's target mutates this to
 *  `startsWith`, which the fixture's "hot-001"/"hot-0010" pair is built to catch: "hot-0010"
 *  starts with "hot-001". */
function findHotspotCandidates(root: SVGSVGElement, hotspotId: string): Element[] {
  const all: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
  return all.filter((el) => el.getAttribute("id") === hotspotId);
}

const HOTSPOT_HIGHLIGHT_STROKE = "#06b6d4"; // --color-neon-cyan, src/index.css

/** Marks exactly the ONE found candidate — called only on the `found` branch, so there is no
 *  "first of several" choice to make (M6/M8's target: a not-found or ambiguous read must
 *  highlight nothing at all). */
function highlight(el: Element): void {
  el.setAttribute("data-hotspot-highlighted", "");
  el.setAttribute("stroke", HOTSPOT_HIGHLIGHT_STROKE);
  el.setAttribute("stroke-width", "3");
  el.setAttribute("style", `outline: 2px solid ${HOTSPOT_HIGHLIGHT_STROKE};`);
}

function resolveHotspot(root: SVGSVGElement, hotspotId: string | null | undefined, icn: string): HotspotResult {
  if (hotspotId === undefined || hotspotId === null) {
    return { state: "none", text: "This row names no hotspot." };
  }
  const candidates = findHotspotCandidates(root, hotspotId);
  if (candidates.length === 0) {
    return { state: "not-found", text: `Hotspot ${hotspotId} is not in ${icn}.` };
  }
  if (candidates.length > 1) {
    return {
      state: "ambiguous",
      text: `${candidates.length} elements share the id ${hotspotId}; none highlighted.`,
    };
  }
  highlight(candidates[0]);
  return { state: "found", text: `Hotspot ${hotspotId}` };
}

function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function Illustration({ illustration }: IllustrationProps) {
  const valid = isIllustrationPayload(illustration);
  const payload = valid ? illustration : null;

  const staticState = payload ? computeStaticState(payload) : null;
  const shouldFetch = payload !== null && staticState === null;
  const contentPath = payload?.content_path ?? null;
  const icn = payload?.icn ?? "";
  const hotspotId = payload?.hotspot_id ?? null;

  const [phase, setPhase] = useState<FetchPhase>("loading");
  const [sanitized, setSanitized] = useState<SanitizedSvg | null>(null);
  const [hotspot, setHotspot] = useState<HotspotResult | null>(null);
  const [fetchStatus, setFetchStatus] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shouldFetch || contentPath === null) return;
    let cancelled = false;
    setPhase("loading");
    setSanitized(null);
    setHotspot(null);
    setFetchStatus(null);

    fetchIllustrationContent(contentPath)
      .then((text) => {
        if (cancelled) return;
        const result = sanitizeSvg(text);
        if (result === null) {
          setPhase("unparseable");
          return;
        }
        setHotspot(resolveHotspot(result.svg, hotspotId, icn));
        setSanitized(result);
        setPhase("drawn");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } } | null)?.response?.status;
        setFetchStatus(typeof status === "number" ? status : null);
        setPhase("fetch-failed");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFetch, contentPath, hotspotId, icn]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    clearChildren(container);
    if (phase !== "drawn" || !sanitized) return;
    // `document.importNode`, never `innerHTML` — see `sanitizeSvg.ts`'s header.
    container.appendChild(document.importNode(sanitized.svg, true));
  }, [phase, sanitized]);

  if (!valid || !payload) {
    return (
      <p
        data-illustration-absent
        className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
      >
        no illustration
      </p>
    );
  }

  const state: CardState = staticState ?? phase;
  const partLine = buildPartLine(payload.part);

  let stateText: string | null = null;
  switch (state) {
    case "media-unknown":
      stateText = `${icn}: the server did not say what format this is.`;
      break;
    case "undrawable":
      stateText = `${icn} is ${payload.media_type}; this viewer draws SVG only.`;
      break;
    case "unserved":
      stateText = `The server did not serve ${icn}'s content.`;
      break;
    case "path-refused":
      stateText = `Refused to fetch ${icn}: not a gateway path.`;
      break;
    case "loading":
      stateText = `Loading ${icn}…`;
      break;
    case "fetch-failed":
      stateText =
        fetchStatus !== null
          ? `Failed to fetch ${icn}'s content (HTTP ${fetchStatus}).`
          : `Failed to fetch ${icn}'s content.`;
      break;
    case "unparseable":
      stateText = `${icn}'s content could not be parsed as SVG.`;
      break;
    case "drawn":
      stateText = null;
      break;
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-slate-700/50 bg-slate-900/40 p-3"
      data-archetype="ILLUSTRATION"
      data-illustration-state={state}
      {...(state === "drawn" && hotspot ? { "data-illustration-hotspot": hotspot.state } : {})}
    >
      <div className="flex flex-col gap-0.5">
        {payload.title && <h3 className="font-mono text-sm text-slate-200">{payload.title}</h3>}
        <p className="font-mono text-[10px] text-slate-400" data-illustration-icn>
          {icn}
        </p>
        {partLine && (
          <p className="font-mono text-[10px] text-slate-500" data-illustration-part>
            {partLine}
          </p>
        )}
      </div>

      {stateText && <p className="font-mono text-[10px] text-slate-400">{stateText}</p>}

      {state === "drawn" && (
        <>
          <div data-illustration-canvas ref={canvasRef} />
          {sanitized && sanitized.removed > 0 && (
            <p
              className="font-mono text-[10px] uppercase tracking-widest text-amber-400/80"
              data-illustration-sanitized-removed={sanitized.removed}
            >
              {sanitized.removed} element(s) removed for safety
            </p>
          )}
          {hotspot && <p className="font-mono text-[10px] text-slate-400">{hotspot.text}</p>}
        </>
      )}
    </section>
  );
}
