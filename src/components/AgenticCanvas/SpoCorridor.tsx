import { useState } from "react";
import type { CorridorData, CorridorNodeState } from "@/lib/decisionMap";

/**
 * SPO Corridor — the approved decision-path map (design handoff "2a").
 *
 * Read one decision left-to-right as a sentence: SUBJECT (chosen among
 * candidates) → PREDICATE (chosen among scored alternates) → OBJECT
 * produced. Deterministic three-column layout: subjects left, predicates
 * middle (labels ON the lines, not boxes), objects right. The chosen S–P–O
 * is a bright glowing spine; alternates are dashed with their scores riding
 * the lines; ghost/context/unverified nodes render in the states below.
 *
 * High-fidelity recreation of the SVG prototype — geometry, tokens, dashes,
 * and animations per the handoff README. Positions are pure functions of
 * the sorted data (same input → same picture).
 */

// input shape (CorridorData / CorridorNodeState) lives in @/lib/decisionMap.

// ── tokens ──────────────────────────────────────────────────────────────
const ACCENT = "#3ee6f7";
const CHOSEN_FILL = "#0b2f3f";
const AMBER = "#ffd166";
const CX = { subj: 150, pivot: 440, pred: 785, obj: 1052 };
const CY = 360;

// alternate predicate rows: 76px pitch, alternating above/below, strongest
// nearest the spine (README §Layout).
function altRowY(i: number): number {
  const side = i % 2 === 0 ? -1 : 1;
  const rank = Math.floor(i / 2) + 1;
  return CY + side * 76 * rank;
}

export function SpoCorridor({
  data,
  animate = true,
  showScores = true,
}: {
  data: CorridorData;
  animate?: boolean;
  showScores?: boolean;
}) {
  const [folded, setFolded] = useState(false);
  const FOLD_THRESHOLD = 0.1;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const anim = animate && !reduced;

  const chosen = data.predicates.find((p) => p.chosen) ?? null;
  const alternatesAll = data.predicates
    .filter((p) => !p.chosen)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const autoFold = data.predicates.length > 12;
  const isFolded = folded || autoFold;
  const foldable = alternatesAll.filter((p) => (p.score ?? 1) < FOLD_THRESHOLD);
  const alternates = isFolded
    ? alternatesAll.filter((p) => (p.score ?? 1) >= FOLD_THRESHOLD)
    : alternatesAll;

  const stateOf = (name: string): CorridorNodeState | undefined =>
    data.unverifiedAll ? "unverified" : data.nodeStates?.[name];

  const height = Math.max(740, 120 + alternates.length * 76 + 120);

  return (
    <div className="h-full w-full overflow-auto" style={{ background: "#070c13" }}>
      <div className="mx-auto max-w-[1240px] p-4">
        <div
          className="rounded-xl"
          style={{ background: "#050d18", border: "1px solid rgba(62,230,247,.14)" }}
        >
          {/* top bar */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid rgba(62,230,247,.1)" }}
          >
            <span style={topBar}>DECISION PATH · SPO CORRIDOR</span>
            <span style={{ ...topBar, color: "#bdf6ff" }}>
              {data.subject.chosen} ─ {chosen?.name ?? "—"} ▸ {chosen?.object ?? "—"}
            </span>
          </div>

          <svg viewBox={`0 0 1210 ${height}`} width="100%" style={{ display: "block" }}>
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
              </marker>
              <marker id="arrowDim" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 z" fill="rgba(62,230,247,.4)" />
              </marker>
            </defs>

            {/* column captions */}
            <text x={CX.subj} y={16} style={caption} textAnchor="middle">SUBJECTS</text>
            <text x={CX.pred} y={16} style={caption} textAnchor="middle">PREDICATES</text>
            <text x={CX.obj} y={16} style={caption} textAnchor="middle">OBJECTS</text>

            {/* ── subject candidates (dashed, recall chips, dashed ties) ── */}
            {data.subject.candidates.slice(0, 6).map((c, i) => {
              const y = 110 + i * 125;
              return (
                <g key={`subj-${c.name}`}>
                  <path
                    d={`M ${CX.subj + 30} ${y} C 310 ${y}, 345 ${CY + (y - CY) * 0.2}, ${CX.pivot - 66} ${CY}`}
                    fill="none"
                    stroke="rgba(62,230,247,.32)"
                    strokeWidth={1.2}
                    strokeDasharray="4 7"
                  />
                  <SubjectCandidate name={c.name} recall={c.recall} x={CX.subj} y={y} showScores={showScores} state={stateOf(c.name)} />
                </g>
              );
            })}

            {/* ── alternate predicates: dashed lines + on-line labels ── */}
            {alternates.map((p, i) => {
              const y = altRowY(i);
              const exitAngle = Math.atan2(y - CY, 300);
              const exitX = CX.pivot + 64 * Math.cos(exitAngle);
              const exitY = CY + 64 * Math.sin(exitAngle);
              const st = stateOf(p.object);
              return (
                <g key={`alt-${p.name}`}>
                  <path
                    d={`M ${exitX} ${exitY} C ${exitX + 65} ${(exitY + y) / 2}, 560 ${y}, 610 ${y} L 1006 ${y}`}
                    fill="none"
                    stroke="rgba(62,230,247,.32)"
                    strokeWidth={1.4}
                    strokeDasharray="5 7"
                    strokeLinecap="round"
                    markerEnd="url(#arrowDim)"
                  />
                  {/* labels ride the line (no box) */}
                  <text x={786} y={y - 7} textAnchor="end" style={predName}>{p.name}</text>
                  {showScores && typeof p.score === "number" && (
                    <text x={798} y={y - 7} textAnchor="start" style={predScore}>{p.score.toFixed(2)}</text>
                  )}
                  <ObjectNode label={p.object} x={CX.obj} y={y} r={36} state={st} />
                </g>
              );
            })}

            {/* fold affordance / summary pill */}
            {(foldable.length > 0 || autoFold) && (
              <FoldControl
                y={CY + (alternates.length / 2 + 1) * 76 + 20}
                foldedCount={isFolded ? foldable.length : 0}
                isFolded={isFolded}
                threshold={FOLD_THRESHOLD}
                onToggle={() => setFolded((f) => !f)}
                autoFold={autoFold}
              />
            )}

            {/* ── the chosen spine (solid, glowing) ── */}
            {chosen && (
              <>
                <path d="M 504 360 L 986 360" stroke={ACCENT} strokeWidth={4} strokeLinecap="round"
                  markerEnd="url(#arrow)" style={{ filter: "drop-shadow(0 0 9px rgba(62,230,247,.7))" }} />
                {anim && (
                  <path d="M 504 360 L 986 360" stroke="#d9fbff" strokeWidth={3} strokeLinecap="round"
                    strokeDasharray="4 20">
                    <animate attributeName="stroke-dashoffset" from="0" to="-96" dur="2.2s" repeatCount="indefinite" />
                  </path>
                )}
                {anim && (
                  <>
                    <circle r={4.5} fill="#eafeff">
                      <animateMotion dur="1.9s" repeatCount="indefinite" path="M 504 360 L 986 360" />
                    </circle>
                    <circle r={3} fill="#bdf6ff">
                      <animateMotion dur="1.9s" begin="0.95s" repeatCount="indefinite" path="M 504 360 L 986 360" />
                    </circle>
                  </>
                )}
                {/* chosen predicate label ON the line + score chip below */}
                <text x={745} y={342} textAnchor="middle" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13.5, fill: "#dffbff" }}>
                  {chosen.name}
                </text>
                {showScores && typeof chosen.score === "number" && (
                  <g>
                    <rect x={745 - 27} y={372} width={54} height={21} rx={10.5} fill={ACCENT} />
                    <text x={745} y={387} textAnchor="middle" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12, fill: "#052733" }}>
                      {chosen.score.toFixed(2)}
                    </text>
                  </g>
                )}
              </>
            )}

            {/* ── pivot (chosen subject) ── */}
            <ChosenBubble
              cx={CX.pivot} cy={CY} r={64} haloR={92} label={data.subject.chosen}
              fontSize={16} anim={anim} haloDelay={0}
            />
            <text x={CX.pivot} y={274} textAnchor="middle" style={tag}>CHOSEN SUBJECT</text>
            {showScores && typeof data.subject.conf === "number" && (
              <g>
                <rect x={CX.pivot - 27} y={436 - 15} width={54} height={20} rx={10} fill={ACCENT} />
                <text x={CX.pivot} y={436 - 1} textAnchor="middle" style={{ fontFamily: MONO, fontWeight: 700, fontSize: 11, fill: "#052733" }}>
                  conf {data.subject.conf.toFixed(2)}
                </text>
              </g>
            )}

            {/* ── chosen object ── */}
            {chosen && (
              <>
                <ChosenBubble
                  cx={CX.obj} cy={CY} r={54} haloR={72} label={chosen.object}
                  fontSize={13.5} anim={anim} haloDelay={0.6}
                />
                <text x={1120} y={364} style={tag}>PRODUCED</text>
              </>
            )}
          </svg>

          <StateKey />
        </div>
      </div>
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────
const MONO = "'JetBrains Mono', ui-monospace, monospace";

function ChosenBubble({ cx, cy, r, haloR, label, fontSize, anim, haloDelay }: {
  cx: number; cy: number; r: number; haloR: number; label: string; fontSize: number; anim: boolean; haloDelay: number;
}) {
  const lines = wrap(label, 12);
  return (
    <g>
      <circle cx={cx} cy={cy} r={haloR} fill={ACCENT} opacity={0.16} style={{ filter: `blur(${r > 60 ? 24 : 20}px)` }}>
        {anim && <animate attributeName="opacity" values="0.28;0.6;0.28" dur="3.2s" begin={`${haloDelay}s`} repeatCount="indefinite" />}
      </circle>
      <circle cx={cx} cy={cy} r={r} fill={CHOSEN_FILL} stroke={ACCENT} strokeWidth={2.5}
        style={{ filter: "drop-shadow(0 0 16px rgba(62,230,247,.55))" }} />
      {lines.map((ln, i) => (
        <text key={i} x={cx} y={cy + (lines.length === 1 ? 5 : i === 0 ? -4 : 13)} textAnchor="middle"
          style={{ fontFamily: MONO, fontWeight: 700, fontSize, fill: "#eafcff" }}>
          {ln}
        </text>
      ))}
    </g>
  );
}

function SubjectCandidate({ name, recall, x, y, showScores, state }: {
  name: string; recall?: number; x: number; y: number; showScores: boolean; state?: CorridorNodeState;
}) {
  const stroke = state === "unverified" ? AMBER : state === "missing" ? "rgba(126,172,194,.5)" : "rgba(62,230,247,.5)";
  const dash = state === "unverified" ? "2 3" : "5 5";
  const op = state === "missing" ? 0.55 : 1;
  const chipW = (`recall ${(recall ?? 0).toFixed(2)}`.length) * 6.9 + 20;
  return (
    <g opacity={op}>
      <circle cx={x} cy={y} r={38} fill="rgba(12,44,58,.5)" stroke={stroke} strokeWidth={1.6} strokeDasharray={dash} />
      <text x={x} y={y + 4} textAnchor="middle" style={{ fontFamily: MONO, fontWeight: 500, fontSize: 12, fill: "rgba(222,248,253,.88)" }}>
        {name.length > 9 ? name.slice(0, 8) + "…" : name}
      </text>
      {state === "unverified" && <text x={x + 26} y={y - 24} style={{ fontFamily: MONO, fontSize: 12, fill: AMBER }}>?</text>}
      {showScores && typeof recall === "number" && (
        <g transform={`translate(${x - chipW / 2}, ${y + 47})`}>
          <rect width={chipW} height={18} rx={9} fill="rgba(6,26,36,.9)" stroke="rgba(62,230,247,.35)" />
          <text x={chipW / 2} y={13} textAnchor="middle" style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11, fill: "#8feafb" }}>
            recall {recall.toFixed(2)}
          </text>
        </g>
      )}
    </g>
  );
}

function ObjectNode({ label, x, y, r, state }: { label: string; x: number; y: number; r: number; state?: CorridorNodeState }) {
  const lines = wrap(label, 11);
  const missing = state === "missing";
  const unverified = state === "unverified";
  const stroke = unverified ? AMBER : missing ? "rgba(126,172,194,.4)" : "rgba(126,172,194,.17)";
  const textFill = "rgba(148,190,210,.32)";
  return (
    <g opacity={missing ? 0.55 : 1}>
      <circle cx={x} cy={y} r={r} fill="rgba(9,30,42,.45)" stroke={stroke} strokeWidth={1.2}
        strokeDasharray={unverified ? "2 3" : missing ? "5 5" : undefined} />
      {unverified && <text x={x + r - 8} y={y - r + 12} style={{ fontFamily: MONO, fontSize: 12, fill: AMBER }}>?</text>}
      {lines.map((ln, i) => (
        <text key={i} x={x} y={y + (lines.length === 1 ? 4 : i === 0 ? -3 : 12)} textAnchor="middle"
          style={{ fontFamily: MONO, fontWeight: 500, fontSize: 11, fill: textFill }}>
          {ln}
        </text>
      ))}
    </g>
  );
}

function FoldControl({ y, foldedCount, isFolded, threshold, onToggle, autoFold }: {
  y: number; foldedCount: number; isFolded: boolean; threshold: number; onToggle: () => void; autoFold: boolean;
}) {
  if (isFolded && foldedCount > 0) {
    return (
      <g onClick={onToggle} style={{ cursor: "pointer" }}>
        <rect x={785 - 138} y={y} width={276} height={32} rx={16} fill="none"
          stroke="rgba(126,172,194,.25)" strokeDasharray="4 5" />
        <text x={785} y={y + 21} textAnchor="middle" style={{ fontFamily: MONO, fontSize: 11, fill: "rgba(148,190,210,.6)" }}>
          ▸ {foldedCount} alternates under {threshold.toFixed(2)} — expand
        </text>
      </g>
    );
  }
  if (autoFold) return null;
  return (
    <text x={785} y={y} textAnchor="middle" onClick={onToggle}
      style={{ fontFamily: MONO, fontSize: 11, fill: "rgba(125,238,251,.55)", letterSpacing: ".08em", cursor: "pointer" }}>
      ⌄ fold alternates under {threshold.toFixed(2)}
    </text>
  );
}

function StateKey() {
  const items = [
    { k: "chosen", label: "chosen path", render: <circle cx={7} cy={7} r={6} fill={ACCENT} /> },
    { k: "eval", label: "evaluated, passed · score kept", render: <circle cx={7} cy={7} r={6} fill="none" stroke={ACCENT} strokeDasharray="3 2.5" /> },
    { k: "ctx", label: "context only", render: <circle cx={7} cy={7} r={6} fill="none" stroke="rgba(126,172,194,.4)" /> },
    { k: "missing", label: "traversed, now missing", render: <circle cx={7} cy={7} r={6} fill="none" stroke="rgba(126,172,194,.4)" strokeDasharray="3 2" opacity={0.55} /> },
    { k: "unver", label: "couldn't verify", render: <><circle cx={7} cy={7} r={6} fill="none" stroke={AMBER} strokeDasharray="1.5 2" /><text x={7} y={11} textAnchor="middle" style={{ fontSize: 9, fill: AMBER }}>?</text></> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-5 px-5 py-2.5"
      style={{ borderTop: "1px solid rgba(62,230,247,.1)" }}>
      <span style={{ ...caption, fontSize: 10 }}>STATE KEY</span>
      {items.map((it) => (
        <div key={it.k} className="flex items-center gap-1.5">
          <svg width={15} height={15}>{it.render}</svg>
          <span style={{ fontFamily: MONO, fontSize: 10, color: "rgba(148,190,210,.6)" }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── style objects ────────────────────────────────────────────────────
const topBar: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: 10.5, letterSpacing: ".14em", color: "rgba(125,238,251,.65)",
};
const caption: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: 10, letterSpacing: ".2em", fill: "rgba(125,238,251,.4)", color: "rgba(125,238,251,.4)",
} as React.CSSProperties;
const tag: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: 9.5, letterSpacing: ".24em", fill: "rgba(125,238,251,.55)",
} as React.CSSProperties;
const predName: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 500, fontSize: 12, fill: "rgba(198,238,248,.78)",
} as React.CSSProperties;
const predScore: React.CSSProperties = {
  fontFamily: MONO, fontWeight: 600, fontSize: 11.5, fill: "#8feafb",
} as React.CSSProperties;

function wrap(s: string, per: number): string[] {
  if (s.length <= per) return [s];
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > per && cur) {
      lines.push(cur.trim());
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 2);
}
