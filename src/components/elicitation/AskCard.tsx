import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  BIND,
  PickRefused,
  resolveAsk,
  validateAsk,
  type AskCardPayload,
  type Reroute,
} from "./Elicitation.contract";

/**
 * The ask, rendered inline — a question, never an answer.
 *
 * IT MUST NOT LOOK LIKE A CARD. This used to fall through to KNOWLEDGE_DOCUMENT and arrive as
 * a document beside real answers: same frame, same weight, same place. A reader scanning the
 * rail saw an answer that happened to be confusing rather than a question waiting on them. So
 * there is no glass panel, no title, no freshness stamp and no inspect affordance — one line
 * of ask and a way to reply.
 *
 * ── WHY THE MENU'S ABSENCE IS SAID OUT LOUD ───────────────────────────────────────────────
 *
 * "No options" is four different facts: the class is larger than a menu, the provider does not
 * enumerate it, nobody was asked, or the slot names a literal with nothing to list. Only one of
 * those is a gap in the system, and it is the one that should disappear as providers register —
 * which nobody can see happening unless the card says which it was.
 *
 * ── THE PICK IS CHECKED HERE, BEFORE ANYTHING IS SENT ─────────────────────────────────────
 *
 * Not because the server will not check — it will, and its refusal is the real gate — but
 * because a fabricated pick should never become a request. The check is the same one the
 * producer runs, ported rather than approximated.
 */

/** How each source reads to someone who did not build the router. */
const SOURCE_LANGUAGE: Record<string, string> = {
  resolution: "from what you said",
  declaration: "the values this accepts",
  enumeration: "everything of this kind",
  none: "",
};

/** Why there is no menu, in the reader's terms rather than the router's. */
const NO_MENU_LANGUAGE: Record<string, string> = {
  too_many: "too many to list — type one",
  unsupported: "these cannot be listed — type one",
  no_provider: "nothing can list these yet — type one",
  no_referent: "this takes a value, not a name",
};

/** `project_id` → `project`. The `_id` suffix is a fact about a signature, not about a thing. */
function slotWord(slot: string): string {
  return slot.replace(/_id$/, "").replace(/_/g, " ");
}

export function AskCard({
  component,
  onReroute,
}: {
  component: unknown;
  /** Where an answered ask goes. Injected so this component dispatches nothing itself. */
  onReroute?: (reroute: Reroute, ask: AskCardPayload) => void;
}) {
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  const result = validateAsk(component);
  if (result.kind === "abstained") {
    // AN ABSTAIN IS NOT AN ASK. Nothing was run and there is nothing to choose from, so there
    // is no input here — a reply could not route, and offering one asks a person to do
    // something that can only fail. The producer's prose says so in its own words.
    return (
      <p
        className="px-1 py-2 border-l-2 border-slate-600/50 pl-3 font-mono text-[12px] text-slate-400"
        data-ask-abstained
      >
        {result.message}
      </p>
    );
  }
  if (result.kind === "empty") {
    // An ask that cannot say what it wants is not a question. Said plainly rather than drawn
    // as an empty prompt, which would invite an answer to nothing.
    return (
      <p className="font-mono text-[11px] text-amber-400/80 px-1 py-2">{result.reason}</p>
    );
  }
  const ask = result.ask;

  const answer = (value: string) => {
    try {
      setRefusal(null);
      onReroute?.(resolveAsk(ask, value), ask);
    } catch (e) {
      // REFUSED, AND SAID. A pick that was not offered is not a near miss to be helpfully
      // corrected into something — the reader sees why, and nothing is sent.
      setRefusal(e instanceof PickRefused ? e.message : String(e));
    }
  };

  const sourceLine = SOURCE_LANGUAGE[ask.option_source] ?? ask.option_source;
  const noMenuLine = ask.free_text_reason
    ? NO_MENU_LANGUAGE[ask.free_text_reason] ?? ask.free_text_reason
    : "";

  return (
    <div className="px-1 py-2 border-l-2 border-neon-cyan/40 pl-3" data-ask-card>
      <p className="flex items-start gap-2 font-mono text-[12px] text-slate-200">
        <HelpCircle className="w-3.5 h-3.5 text-neon-cyan/70 flex-shrink-0 mt-0.5" />
        <span>
          Which <span className="text-neon-cyan">{slotWord(ask.slot)}</span>?
          {/* WHAT WAS FOUND, KEPT AS CONTEXT. When a candidate resolved to the wrong class the
              reader WAS understood, and saying so is the difference between "I need a project"
              and "I found the thing you meant and it is not a project". */}
          {ask.found && (
            <span className="text-slate-400">
              {" "}
              I found <span className="text-slate-200">{ask.found}</span>, but that is not one.
            </span>
          )}
        </span>
      </p>

      {ask.options.length > 0 ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5" data-ask-options>
            {ask.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => answer(o.value)}
                data-ask-option={o.value}
                className="px-2 py-1 rounded border border-neon-cyan/30 hover:border-neon-cyan/70 hover:bg-neon-cyan/10 font-mono text-[11px] text-slate-200"
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500">
            <span data-option-source={ask.option_source}>{sourceLine}</span>
            {/* THE BOUND, SAID. A menu of eight drawn from fourteen is a different object from a
                menu of eight that is all of them, and a reader choosing from the first should
                know the rest exist. */}
            {ask.truncated_from > 0 && (
              <span className="text-slate-600"> · {ask.truncated_from} matched</span>
            )}
          </p>
        </>
      ) : (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            answer(typed);
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={slotWord(ask.slot)}
            aria-label={`answer: ${slotWord(ask.slot)}`}
            className="flex-1 min-w-0 bg-white/[.04] border border-white/10 rounded px-2 py-1 font-mono text-[12px] text-slate-100 focus:outline-none focus:border-neon-cyan/50"
          />
          <button
            type="submit"
            className="px-2 py-1 rounded border border-neon-cyan/30 hover:bg-neon-cyan/10 font-mono text-[11px] text-slate-200"
          >
            answer
          </button>
        </form>
      )}

      {/* WHY THERE IS NO MENU — one of four facts, never a shrug. `no_provider` is the only one
          that is a gap in the system rather than a property of the data, and it is the one that
          disappears as providers register. Nobody sees that happen unless it is named. */}
      {ask.options.length === 0 && noMenuLine && (
        <p
          className="mt-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-500"
          data-free-text-reason={ask.free_text_reason ?? ""}
        >
          {noMenuLine}
          {/* HOW MANY EXIST — a DIFFERENT number from `truncated_from`, which counts what was
              cut and is 0 here because `too_many` returns no members at all. It arrived as a
              field on 2026-09-03; before that it lived only inside the prose `message`, and
              recovering it would have meant parsing an English sentence for a number. */}
          {ask.total_count > 0 && (
            <span className="text-slate-600" data-total-count={ask.total_count}>
              {" "}
              · {ask.total_count} exist
            </span>
          )}
        </p>
      )}

      {refusal && (
        <p className="mt-2 font-mono text-[10px] text-rose-300" data-pick-refused>
          {refusal}
        </p>
      )}
    </div>
  );
}

export { BIND };
