import { useEffect, useMemo, useRef } from "react";
import { placeOf, type ReviewPlan, type ReviewUnit, type Template, type UnitFlag } from "@/lib/reviewRuns";

/** Why a flag is on the line, in the card's own words. A straggler is drawn apart, it is a position not a doubt. */
export function flagText(f: UnitFlag): string {
  switch (f.kind) {
    case "extractor-unsure":
      return f.reason ? `unsure: ${f.reason}` : "extractor unsure";
    case "region":
      return "table box, not the cell";
    case "unknown-method":
      return "unknown method";
    case "no-box":
      return "no box";
    case "no-evidence":
      return "no evidence";
    case "straggler":
      return "straggler";
  }
}

/** The doubts a steward must read (every flag but straggler). */
export const doubtsOf = (u: ReviewUnit): UnitFlag[] => u.flags.filter((f) => f.kind !== "straggler");

/**
 * A string with the characters that VARY across a run on an amber ground, underlined, and the static ones in
 * slate-300: the eye lands on the digits that differ and skips the rest. `varies` is the run's mask over the
 * first member; every member has the same length (equal shapes), so the mask applies to any of them. No
 * padding, so adjacent varying characters read as one box and the column lines up.
 */
export function Marked({ text, varies }: { text: string; varies: boolean[] | null }) {
  return (
    <>
      {[...text].map((c, i) =>
        varies && varies[i] ? (
          <span key={i} className="bg-[#3D2A0C] text-[#FFC266] underline underline-offset-[3px]" data-varies>
            {c}
          </span>
        ) : (
          <span key={i} className="text-slate-300">
            {c}
          </span>
        ),
      )}
    </>
  );
}

function Pair({ mpn, replacement, affected, repl }: { mpn: string; replacement: string | null; affected: Template | null; repl: Template | null }) {
  return (
    <>
      <Marked text={mpn} varies={affected?.varies ?? null} />
      {replacement !== null && (
        <>
          <span className="text-slate-600"> → </span>
          <Marked text={replacement} varies={repl?.varies ?? null} />
        </>
      )}
    </>
  );
}

/** The marks on one part's line: looked, edited, doubts, sample. */
export function UnitMarks({ unit, looked, edited, sample }: { unit: ReviewUnit; looked: boolean; edited: boolean; sample: boolean }) {
  return (
    <span className="ml-2 inline-flex flex-wrap gap-x-2 text-[10px]">
      {looked && <span className="text-cyan-300" data-mark="looked">✓</span>}
      {edited && <span className="text-pink-300" data-mark="edited">✎</span>}
      {unit.flags.map((f, i) =>
        f.kind === "straggler" ? (
          <span key={i} className="text-amber-400" data-mark="straggler">
            straggler
          </span>
        ) : (
          <span key={i} className="text-amber-400" data-mark="flag">
            ⚑ {flagText(f)}
          </span>
        ),
      )}
      {sample && !looked && <span className="text-slate-500" data-mark="sample">sample</span>}
    </span>
  );
}

const SEL_RING = "border-pink-400/60 ring-1 ring-pink-400/30";

/**
 * The parts, as run cards. A run is a series whose pairs differ only in a counter: one header stands for the
 * lot, and opening it lists the members, each one click from its evidence on the page. Singles (a straggler,
 * or a part in too short a stretch to be a run) are cards of their own. A sticky bar at the top says where
 * the selected part is in the tree.
 *
 * It owns no state: what is looked, edited, open and selected is the card's, so the same facts drive this
 * list, the progress bar, the callout and the promote hold.
 */
export function ReviewRunsList({
  plan,
  selectedUnit,
  looked,
  edited,
  open,
  onToggle,
  onSelect,
}: {
  plan: ReviewPlan;
  selectedUnit: number;
  looked: ReadonlySet<string>;
  edited: ReadonlySet<number>;
  open: ReadonlySet<string>;
  onToggle: (runId: string) => void;
  onSelect: (unit: number) => void;
}) {
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const places = useMemo(() => placeOf(plan), [plan]);
  const selPlace = places.get(selectedUnit);
  const selRun = selPlace?.runId;
  // Scroll the selected line into view like the table does; also when its run has just been opened.
  const selRunOpen = selRun === undefined ? true : open.has(selRun);
  useEffect(() => {
    lineRefs.current.get(selectedUnit)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedUnit, selRunOpen]);

  const selUnitObj = plan.units[selectedUnit];
  const hereText = selPlace
    ? `S${selPlace.ordinal} · part ${selPlace.pos + 1} of ${selPlace.size} · ${selectedUnit + 1} of ${plan.units.length}`
    : selUnitObj
      ? `${selUnitObj.mpn} · ${selectedUnit + 1} of ${plan.units.length}${selUnitObj.flags.some((f) => f.kind === "straggler") ? " · ↯ straggler" : ""}`
      : "";
  const showSelected = () => {
    if (selRun !== undefined && !open.has(selRun)) onToggle(selRun);
    else lineRefs.current.get(selectedUnit)?.scrollIntoView?.({ block: "nearest" });
  };

  const line = (u: number, run: { affected: Template; replacement: Template | null } | null) => {
    const unit = plan.units[u];
    const isLooked = looked.has(unit.id);
    const isEdited = edited.has(u);
    const selected = u === selectedUnit;
    const isStraggler = unit.flags.some((f) => f.kind === "straggler");
    const common = {
      ref: (el: HTMLElement | null) => {
        if (el) lineRefs.current.set(u, el);
        else lineRefs.current.delete(u);
      },
      role: "option" as const,
      "aria-selected": selected,
      onClick: () => onSelect(u),
      "data-unit": unit.id,
      "data-selected": selected ? "" : undefined,
      "data-looked": isLooked ? "" : undefined,
      "data-edited": isEdited ? "" : undefined,
      "data-flag": unit.flags.length > 0 ? unit.flags.map((f) => f.kind).join(" ") : undefined,
    };
    if (run) {
      const pos = places.get(u)?.pos ?? 0;
      return (
        <div
          key={unit.id}
          {...common}
          className={`cursor-pointer grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 min-h-[32px] px-3 even:bg-white/[0.02] ${
            selected ? "bg-pink-500/10 shadow-[inset_2px_0_0_#f472b6] text-slate-100" : "hover:bg-white/5"
          }`}
        >
          <span className="text-[10px] text-slate-500 text-right" data-member-pos>
            {pos + 1}
          </span>
          <span className="min-w-0 break-all">
            <Pair mpn={unit.mpn} replacement={unit.replacement} affected={run.affected} repl={run.replacement} />
          </span>
          <UnitMarks unit={unit} looked={isLooked} edited={isEdited} sample={plan.sampled.has(u)} />
        </div>
      );
    }
    return (
      <div
        key={unit.id}
        {...common}
        className={`cursor-pointer rounded-[10px] border min-h-[44px] px-3 py-2 flex flex-wrap items-center gap-3 ${
          isStraggler ? "border-[#6B5320] text-[#EADBB5]" : "border-white/10 bg-[#0F1726] text-slate-200"
        } ${selected ? `${SEL_RING} bg-pink-500/10` : "hover:bg-white/5"}`}
      >
        {isStraggler && <span className="text-[10px] tracking-widest text-amber-400">↯ STRAGGLER</span>}
        <span>
          <Pair mpn={unit.mpn} replacement={unit.replacement} affected={null} repl={null} />
        </span>
        <UnitMarks unit={unit} looked={isLooked} edited={isEdited} sample={plan.sampled.has(u)} />
      </div>
    );
  };

  return (
    <div className="text-[12px] font-mono">
      <div
        role="presentation"
        className="sticky top-0 z-10 bg-[#0B1220]/95 backdrop-blur border-b border-white/10 px-3 py-1.5 flex items-center gap-3 text-slate-300"
        data-runs-here
      >
        <span className="min-w-0 flex-1 truncate">{hereText}</span>
        <button
          type="button"
          onClick={showSelected}
          className="shrink-0 px-2 h-6 rounded border border-[#3A4A66] bg-[#111A2B] text-[11px] text-slate-200 cursor-pointer hover:border-cyan-400"
          data-runs-here-jump
        >
          show
        </button>
      </div>
      <div role="listbox" aria-label="Parts" className="flex flex-col gap-2 p-2 text-[12px] font-mono" data-review-runs>
        {plan.segments.map((seg) => {
          if (seg.kind === "single") return line(seg.unit, null);
          const { run } = seg;
          const isOpen = open.has(run.id);
          const members = run.units;
          const nLooked = members.filter((u) => looked.has(plan.units[u].id)).length;
          const nEdited = members.filter((u) => edited.has(u)).length;
          const nFlagged = members.filter((u) => doubtsOf(plan.units[u]).length > 0 && !looked.has(plan.units[u].id)).length;
          const ordinal = places.get(members[0])!.ordinal;
          const current = selRun === run.id;
          return (
            <div
              key={run.id}
              className={`rounded-[10px] border border-[#1E3A44] bg-[#0F1726] overflow-hidden ${current ? SEL_RING : ""}`}
              data-run-card={run.id}
              data-run-current={current ? "" : undefined}
            >
              <button
                type="button"
                onClick={() => onToggle(run.id)}
                aria-expanded={isOpen}
                data-run={run.id}
                data-run-count={members.length}
                data-run-open={isOpen ? "" : undefined}
                className="w-full min-h-[44px] flex flex-wrap items-center gap-3 px-3 py-2 bg-[#0F1E26] text-[#D6E2F0] text-left cursor-pointer hover:brightness-125"
              >
                <span className="w-3 text-slate-400">{isOpen ? "▾" : "▸"}</span>
                <span className="text-[11px] text-cyan-300" data-run-label>
                  S{ordinal}
                </span>
                <span>
                  <Pair mpn={run.affected.text} replacement={run.replacement?.text ?? null} affected={run.affected} repl={run.replacement} />
                </span>
                <span className="flex-1" />
                <span className="text-slate-400" data-run-total>×{members.length}</span>
                <span className={nLooked === members.length ? "text-emerald-300" : "text-[#4F8F89]"} data-run-looked={nLooked}>
                  ✓ {nLooked}/{members.length}
                </span>
                {nEdited > 0 && <span className="text-pink-300" data-run-edited={nEdited}>✎ {nEdited}</span>}
                {nFlagged > 0 && <span className="text-amber-400" data-run-flagged={nFlagged}>⚑ {nFlagged}</span>}
                {!isOpen && current && selPlace && (
                  <span className="text-[11px] text-pink-300" data-run-here>◉ at {selPlace.pos + 1}</span>
                )}
              </button>
              {isOpen && <div className="py-1.5">{members.map((u) => line(u, run))}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
