import React, { useState } from "react";
import type { ServedList } from "@/lib/servedLists";

export const SERVED_LIST_VISIBLE = 8;

const One: React.FC<{ list: ServedList }> = ({ list }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? list.items : list.items.slice(0, SERVED_LIST_VISIBLE);
  return (
    <div data-served-list>
      {list.label && (
        <p data-served-list-label className="font-mono text-[10px] text-slate-500">
          {list.label}
        </p>
      )}
      <ul className="list-disc pl-4 font-mono text-[11px] text-slate-400">
        {shown.map((it, i) => (
          <li key={i} data-served-list-item>
            {it}
          </li>
        ))}
      </ul>
      {list.items.length > SERVED_LIST_VISIBLE && (
        <button
          type="button"
          data-served-list-toggle
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-[10px] text-slate-500 underline"
        >
          {open ? "show fewer" : `show all ${list.items.length}`}
        </button>
      )}
      {list.total > list.items.length && (
        <p data-served-list-more className="font-mono text-[10px] text-slate-500">
          {list.total - list.items.length} more not shown
        </p>
      )}
    </div>
  );
};

/** Draws served lists (PROPOSED field, see refusalEnvelope); nothing for an empty array. */
export const ServedLists: React.FC<{ lists: ServedList[] }> = ({ lists }) => {
  if (lists.length === 0) return null;
  return (
    <div data-served-lists className="space-y-1">
      {lists.map((l, i) => (
        <One key={i} list={l} />
      ))}
    </div>
  );
};
