import { BIND } from "./Elicitation.contract";
import { AskCard } from "./AskCard";
import type { AskBearingRefusal } from "@/lib/askBearingRefusal";

/**
 * A refusal that carries an ask, drawn as a CHOICE.
 *
 * `AskCard`, not `AskCardConnected`: the connected card's pick is a chat turn, and here the pick
 * is a re-send of the request that was refused. The pick leaves through `onPick` with the
 * OPTION VALUE the card validated, and the caller re-sends it under `ask.binding_slot`.
 *
 * ── FREE TEXT IS NOT A PICK ──────────────────────────────────────────────────────────────
 * `AskCard` draws a free-text box for an ask with NO options and answers it as a RESPEAK, a
 * phrase and not a value. A re-send under a slot name needs a value, so that path never calls
 * `onPick`: an ask with no options is not given the box at all, and the refusal's own message
 * is drawn instead. The `onReroute` guard on RESPEAK is the second lock on the same door.
 *
 * ── NO COLOUR OF ALARM ───────────────────────────────────────────────────────────────────
 * Slate only. This is a question about which program, not a fault.
 */
export function RefusalWithAsk({
  refusal,
  onPick,
  busy,
  title,
  slots,
}: {
  refusal: AskBearingRefusal;
  onPick: (value: string) => void;
  busy?: boolean;
  /** The template's served title, for the plain sentence. */
  title?: string;
  /** The template row's served shared-slot names, used when the 409 names none. */
  slots?: readonly string[];
}) {
  const { ask } = refusal;

  if (ask && ask.options.length > 0) {
    return (
      <div data-refusal-choice {...(busy ? { "data-refusal-busy": "" } : {})}>
        <AskCard
          // A second 409 can ask a different slot; a fresh card, not the first one's lock.
          key={`${ask.binding_slot}:${ask.options.map((o) => o.value).join("|")}`}
          component={ask}
          pending={busy}
          onReroute={(reroute, a) => {
            if (reroute.action !== BIND) {
              return { blocked: "typed words are not an option value" };
            }
            const value = reroute.slots[a.slot];
            if (typeof value !== "string" || value === "") {
              return { blocked: "that pick carried no value" };
            }
            onPick(value);
            return undefined;
          }}
        />
      </div>
    );
  }

  // THE LINE A PERSON READS. The server's `message` is the exception text (ADR reference and
  // all) unless a policy chose it, so it is the line only when a policy did. An empty list says
  // so in the served slot word; any other unbound slot gets a sentence cortex composes from
  // served names, and the server text goes behind a disclosure.
  const slotNames = refusal.slot ? [refusal.slot] : [...(slots ?? [])];
  const line = refusal.emptyList
    ? `You're not a member of any ${refusal.slot}.`
    : refusal.policy
      ? refusal.message
      : `Choose a ${slotNames.length > 0 ? slotNames.join(" and ") : "value"}${title ? ` to create "${title}"` : ""}.`;
  const detail = !refusal.emptyList && !refusal.policy && refusal.message !== "" ? refusal.message : "";
  return (
    <div className="flex flex-col gap-0.5" data-refusal-message-block>
      <p className="font-mono text-[10px] leading-snug text-slate-400" data-refusal-message>
        {line}
      </p>
      {refusal.emptyList && refusal.policy && refusal.policy.message !== "" && (
        <p className="font-mono text-[10px] leading-snug text-slate-500" data-refusal-grant>
          {refusal.policy.message}
        </p>
      )}
      {refusal.emptyList && !refusal.policy && refusal.grantableBy && (
        <p className="font-mono text-[10px] leading-snug text-slate-500" data-refusal-grant>
          {refusal.grantableBy}
        </p>
      )}
      {refusal.policy && typeof refusal.policy.repair === "string" && refusal.policy.repair !== "" && (
        <p className="font-mono text-[10px] leading-snug text-slate-500" data-refusal-repair>
          {refusal.policy.repair}
        </p>
      )}
      {detail !== "" && (
        <details className="font-mono text-[9px] text-slate-500" data-refusal-detail>
          <summary className="cursor-pointer">details</summary>
          {detail}
        </details>
      )}
      {refusal.askUnavailable !== undefined && (
        <span
          className="font-mono text-[9px] uppercase tracking-wider text-slate-500"
          data-refusal-ask-unavailable={refusal.askUnavailable}
        >
          no choice offered{refusal.askUnavailable ? ` · ${refusal.askUnavailable}` : ""}
        </span>
      )}
    </div>
  );
}
