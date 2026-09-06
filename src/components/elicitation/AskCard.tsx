import { useState } from "react";
import { slotWord } from "@/lib/slotWord";
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

// `slotWord` is shared with the in-flight chip: the two surfaces must name the same slot the
// same way, and two copies drift the day one learns about a suffix the other has not met.

/**
 * What this card sent, once it has sent something.
 *
 * `value` is present only for a BIND — a pick carries an id the verb takes, and the card can
 * honestly say `Inventory Visibility -> C4`. A RESPEAK has words and NOTHING ELSE: the
 * resolver has not run, so there is no right-hand side and the card must not draw an arrow to
 * one. That is the same rule the interpretation strip follows for a refused slot, and for the
 * same reason — the arrow asserts that what the reader said BECAME what the system used.
 */
interface Answered {
  slot: string;
  /** What the reader saw and chose, or typed. */
  label: string;
  /** The id it stands for. BIND only; empty on a RESPEAK. */
  value: string;
}

export function AskCard({
  component,
  onReroute,
  pending,
}: {
  component: unknown;
  /** Where an answered ask goes. Injected so this component dispatches nothing itself. */
  onReroute?: (reroute: Reroute, ask: AskCardPayload) => void;
  /** True while the turn this card started is still in flight. Supplied by the wrapper. */
  pending?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * THE ASK DID NOT ACKNOWLEDGE THE PICK. Options stayed live, nothing marked, and the card sat
   * exactly as it had before the click — so the only evidence a person had that their answer
   * went anywhere was the answer eventually arriving somewhere else. A menu that accepts a
   * click and looks unchanged reads as a menu that did not take it, and the natural next move
   * is to click again.
   */
  const [answered, setAnswered] = useState<Answered | null>(null);

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
      const reroute = resolveAsk(ask, value);
      onReroute?.(reroute, ask);
      // LOCKED ONLY AFTER THE RE-ROUTE RESOLVED. A refused pick throws above and never reaches
      // here, so the card cannot lock on an answer that was never sent — which would be the
      // worst of both, showing a choice as made while nothing carried it.
      const picked = ask.options.find((o) => o.value === reroute.slots[ask.slot]);
      setAnswered({
        slot: ask.slot,
        label: picked ? picked.label : value.trim(),
        value: reroute.action === BIND ? String(reroute.slots[ask.slot] ?? "") : "",
      });
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
                /* THE CHOSEN ONE IS MARKED AND THE REST GO QUIET. Disabling every option — the
                   chosen one included — is deliberate: this ask has been answered, and a
                   second pick would issue a second turn against a question already asked. */
                disabled={answered !== null}
                data-ask-chosen={answered?.value === o.value ? "" : undefined}
                className={
                  "px-2 py-1 rounded border font-mono text-[11px] transition-colors " +
                  (answered === null
                    ? "border-neon-cyan/30 hover:border-neon-cyan/70 hover:bg-neon-cyan/10 text-slate-200"
                    : answered.value === o.value
                    ? "border-neon-cyan bg-neon-cyan/15 text-neon-cyan cursor-default"
                    : "border-slate-800 text-slate-600 cursor-default")
                }
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
            disabled={answered !== null}
            placeholder={slotWord(ask.slot)}
            aria-label={`answer: ${slotWord(ask.slot)}`}
            className="flex-1 min-w-0 bg-white/[.04] border border-white/10 rounded px-2 py-1 font-mono text-[12px] text-slate-100 focus:outline-none focus:border-neon-cyan/50"
          />
          <button
            type="submit"
            disabled={answered !== null}
            className="px-2 py-1 rounded border border-neon-cyan/30 hover:bg-neon-cyan/10 font-mono text-[11px] text-slate-200 disabled:border-slate-800 disabled:text-slate-600"
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

      {/* WHAT THIS CARD SENT, said back in the reader's own terms. The arrow appears ONLY for a
          pick, where the label and the id are both known and the second really is what the
          first stands for. Typed words get no arrow: the resolver has not run, so there is no
          right-hand side, and drawing one would assert a narrowing that has not happened. */}
      {answered && (
        <p className="mt-2 font-mono text-[10px] text-slate-400" data-ask-answered>
          <span className="text-slate-500">{slotWord(answered.slot)}: </span>
          <span className="text-slate-200">{answered.label}</span>
          {answered.value && answered.value !== answered.label && (
            <span className="text-neon-cyan"> → {answered.value}</span>
          )}
          {/* IN FLIGHT, AND SAID SO. `pending` is the agent's own processing flag, which is why
              this reads "running" rather than naming this card's request: the client cannot
              tell one turn's stream from another's, and claiming it could would be a precision
              the surface does not have. */}
          {pending && (
            <span className="text-slate-500" data-ask-running>
              {" "}
              · running…
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
