import { signInAttr } from "@/auth/authGate";
/**
 * "What can I ask?" — the list the server serves at `GET /askable_measures` (#525), drawn on the ask bar.
 * Cortex lists nothing of its own and never filters by cells; the words here are generic on purpose.
 * The list is for the cell an ask would run under: the SAME resolver as the question send (resolveSendCell), both
 * persona and domains or neither, so a persona switch re-fetches. Ask SENDS the pick (the entry name as the
 * label, `askable_pick` beside it) through the normal question send, under that same cell.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { fetchAskableMeasures } from "@/api/client";
import { askablePick, groupRows, matchesSearch, type AskableRead, type AskableRow } from "@/lib/askableMeasures";
import { deepLinkPath } from "@/lib/deepLink";
import { resolveSendCell, type SendCell } from "@/lib/sendReadiness";
import { usePersonaStore } from "@/store/usePersonaStore";

/** The Ask action: the same sender the composer uses. Returns what sendMessage returns. */
export type SendAsk = (
  message: string,
  pick: { verb: string; bindings: Record<string, string> },
) => boolean | { notSent: string };

export function AskableTrigger({ sendAsk }: { sendAsk: SendAsk }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={wrapRef}>
      <button
        type="button"
        aria-label="What can I ask?"
        data-askable-trigger
        onClick={() => setOpen((o) => !o)}
        className="flex-shrink-0 flex items-center text-slate-400 hover:text-neon-cyan transition-colors"
      >
        <ListChecks className="w-4 h-4" />
      </button>
      {open && <AskablePanel onClose={() => setOpen(false)} sendAsk={sendAsk} />}
    </span>
  );
}

function AskablePanel({ onClose, sendAsk }: { onClose: () => void; sendAsk: SendAsk }) {
  // The key is the caller's membership AND the cell: two callers must never share an entry, and a persona
  // switch is a different list. The cell is resolved by the ask's own resolver; the selectors return
  // primitives (a JSON string, a message), so the store snapshot stays stable.
  const ownerSub = usePersonaStore((s) => s.ownerSub);
  const cellJson = usePersonaStore((s) => {
    const r = resolveSendCell(s);
    return r.ready ? JSON.stringify(r.cell ?? null) : null;
  });
  const blocked = usePersonaStore((s) => {
    const r = resolveSendCell(s);
    return r.ready ? null : r.message;
  });
  const cell = cellJson === null ? undefined : ((JSON.parse(cellJson) as SendCell | null) ?? undefined);
  const q = useQuery({
    queryKey: ["askable-measures", ownerSub, cell?.active_persona ?? null, cell?.active_domains ?? null],
    queryFn: () => fetchAskableMeasures(cell),
    // No list is asked for until the ask itself could be sent: the entitlement matrix has to have loaded.
    enabled: blocked === null,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div
      data-askable-panel
      className="absolute bottom-full left-0 mb-2 z-50 w-[28rem] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-950/95 backdrop-blur p-3 text-sm shadow-xl"
    >
      {blocked !== null ? (
        <div data-askable-state="not-ready" className="text-slate-400 text-xs">{blocked}</div>
      ) : (
        <PanelBody q={q} onClose={onClose} sendAsk={sendAsk} />
      )}
    </div>
  );
}

function PanelBody({
  q,
  onClose,
  sendAsk,
}: {
  q: UseQueryResult<AskableRead | null>;
  onClose: () => void;
  sendAsk: SendAsk;
}) {
  const msg = (state: string, text: string, extra?: ReactNode) => (
    <div data-askable-state={state} className="text-slate-400 text-xs">
      {text}
      {extra}
    </div>
  );
  if (q.isPending) return msg("loading", "Loading…");
  const d = q.data ?? null;
  if (q.isError || d === null) {
    return msg(
      "unreachable",
      "Can't load what you can ask.",
      <button
        type="button"
        data-askable-retry
        onClick={() => void q.refetch()}
        className="ml-2 text-neon-cyan hover:underline"
      >
        Retry
      </button>,
    );
  }
  if (d.kind === "unreadable") return msg("unreadable", "The list came back in a shape cortex can't read.");
  // A refusal the server SAID: its words, never an empty list.
  if (d.kind === "refused") {
    return (
      <div data-askable-state="refused" data-askable-refusal-code={d.refusal.code ?? ""} {...signInAttr(d.refusal.reason)} className="text-amber-400 text-xs">
        {d.refusal.reason}
      </div>
    );
  }
  const footer = d.invalid.length > 0 && (
    <ul data-askable-invalid className="mt-3 text-[11px] text-slate-500 space-y-0.5">
      {d.invalid.map((e, i) => (
        <li key={i}>{`${e.source}: ${e.reason}`}</li>
      ))}
    </ul>
  );
  if (d.kind === "not-composed") {
    return (
      <>
        {msg("not-composed", "No list is configured on this deployment.")}
        {footer}
      </>
    );
  }
  const n = d.unreadableRows;
  const unreadable = n > 0 && (
    <div data-askable-unreadable-rows={n} className="mt-3 text-[11px] text-amber-400">
      {`${n} ${n === 1 ? "entry came" : "entries came"} back unreadable and ${n === 1 ? "is" : "are"} not shown.`}
    </div>
  );
  if (d.rows.length === 0) {
    return (
      <>
        {msg("empty", "Nothing is declared for your access.")}
        {footer}
        {unreadable}
      </>
    );
  }
  return (
    <div data-askable-state="ready">
      {/* The list names the cell it was filtered for, as served. No persona means no access cell: said plainly,
          and no persona word is invented. cell_source is drawn verbatim, whatever it says. */}
      {d.cell.persona === null ? (
        <div data-askable-scope data-askable-cell-source={d.cell.cellSource} className="text-xs text-slate-400 mb-2">
          You have no access cell.
        </div>
      ) : (
        <div
          data-askable-scope
          data-askable-cell-source={d.cell.cellSource}
          className="text-[10px] uppercase tracking-wider text-slate-500 mb-2"
        >
          {[d.cell.persona, ...d.cell.domains].join(" · ")}
          <span data-askable-cell-source-label className="ml-2 normal-case tracking-normal text-slate-600">
            {d.cell.cellSource}
          </span>
        </div>
      )}
      <ReadyList rows={d.rows} onClose={onClose} sendAsk={sendAsk} />
      {footer}
      {unreadable}
    </div>
  );
}

function ReadyList({ rows, onClose, sendAsk }: { rows: AskableRow[]; onClose: () => void; sendAsk: SendAsk }) {
  const [search, setSearch] = useState("");
  const shown = rows.filter((r) => matchesSearch(r, search));
  return (
    <>
      <input
        data-askable-search
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        // The panel sits inside the ask bar's <form>: an unhandled Enter here would SUBMIT it and send
        // whatever is in the composer. Searching never sends.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder="Search what you can ask"
        className="w-full mb-2 rounded bg-slate-900 border border-slate-700/60 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-neon-cyan/60"
      />
      {shown.length === 0 ? (
        <div data-askable-nomatch className="text-slate-400 text-xs">Nothing matches.</div>
      ) : (
        groupRows(shown).map((g, gi) => (
          <div key={`${g.label ?? "none"}-${gi}`} className="mb-2">
            {g.label !== null && (
              <div data-askable-group className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                {g.label}
              </div>
            )}
            <ul className="space-y-2">
              {g.rows.map((r, i) => (
                <Row key={`${r.verb}-${i}`} row={r} onClose={onClose} sendAsk={sendAsk} />
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );
}

function Row({ row, onClose, sendAsk }: { row: AskableRow; onClose: () => void; sendAsk: SendAsk }) {
  const [notSent, setNotSent] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const ask = row.exampleAsk;

  const flash = (s: "ok" | "fail") => {
    setCopy(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 1500);
  };
  const onCopy = (text: string) => {
    try {
      const w = navigator.clipboard?.writeText(window.location.origin + deepLinkPath({ kind: "ask", q: text }));
      if (!w) return flash("fail");
      w.then(
        () => flash("ok"),
        () => flash("fail"),
      );
    } catch {
      flash("fail");
    }
  };

  return (
    <li data-askable-row data-verb={row.verb}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-200">{row.name}</span>
        {row.unit !== null && (
          <span data-askable-unit className="text-[10px] px-1.5 rounded bg-slate-800 text-slate-400">{row.unit}</span>
        )}
        {row.shape !== null && (
          <span data-askable-shape className="text-[10px] px-1.5 rounded bg-slate-800 text-slate-400">{row.shape}</span>
        )}
      </div>
      <div className="text-xs text-slate-400">{row.description}</div>
      {ask !== null && (
        <div data-askable-example className="mt-1 font-mono text-[11px] text-slate-500">{`"${ask}"`}</div>
      )}
      <div className="mt-1 flex gap-3 text-xs">
        <button
          type="button"
          data-askable-ask
          onClick={() => {
            // The pick goes through the normal question send. A refusal to send (entitlements not loaded) is
            // said here and the panel stays open; a send that went closes it.
            const r = sendAsk(row.name, askablePick(row.verb));
            if (r === true) onClose();
            else if (r !== false) setNotSent(r.notSent);
          }}
          className="text-neon-cyan hover:underline"
        >
          Ask
        </button>
        {ask !== null && (
          <button
            type="button"
            data-askable-copy
            onClick={() => onCopy(ask)}
            className="text-slate-400 hover:text-neon-cyan"
          >
            {copy === "ok" ? "Copied" : copy === "fail" ? "Copy failed" : "Copy link"}
          </button>
        )}
      </div>
      {notSent !== null && (
        <div data-askable-notsent className="mt-1 text-[11px] text-amber-400">{notSent}</div>
      )}
    </li>
  );
}
