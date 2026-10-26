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
}: {
  refusal: AskBearingRefusal;
  onPick: (value: string) => void;
  busy?: boolean;
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

  return (
    <div className="flex flex-col gap-0.5" data-refusal-message-block>
      <p className="font-mono text-[10px] leading-snug text-slate-400" data-refusal-message>
        {refusal.message}
      </p>
      {refusal.policy && typeof refusal.policy.repair === "string" && refusal.policy.repair !== "" && (
        <p className="font-mono text-[10px] leading-snug text-slate-500" data-refusal-repair>
          {refusal.policy.repair}
        </p>
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
