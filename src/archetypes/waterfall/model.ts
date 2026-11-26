/**
 * The bars the card draws — pure, so what is drawn is tested without a DOM. `contract.ts` reads
 * and refuses; this file walks the running total. Steps are in the order they were served.
 */
import { signedText } from "../flow-decomposition/model";
import type { WaterfallTable } from "./contract";
import type { FlowSign } from "../flow-decomposition/contract";

export interface Bar {
  kind: "start" | "step" | "end";
  label: string;
  /** The remainder bar (a level-1 `node_kind: "other"`). */
  remainder: boolean;
  sign: FlowSign;
  /** Running total before and after this bar; a start/end bar runs from 0. */
  from: number;
  to: number;
  /** `+1,000`, `−35`, `1,200`: the sign is in the words, never colour alone; the unit is in the header. */
  text: string;
}

const totalText = (value: number, unit: string | undefined): string =>
  value < 0 ? signedText("negative", -value, unit) : signedText("zero", value, unit);

export function buildBars(t: WaterfallTable): Bar[] {
  const bars: Bar[] = [
    {
      kind: "start",
      label: t.start.label,
      remainder: false,
      sign: t.start.value < 0 ? "negative" : t.start.value > 0 ? "positive" : "zero",
      from: 0,
      to: t.start.value,
      text: totalText(t.start.value, undefined),
    },
  ];
  let running = t.start.value;
  for (const s of t.steps) {
    const to = running + s.signed;
    bars.push({
      kind: "step",
      label: s.label,
      remainder: s.kind === "other",
      sign: s.sign,
      from: running,
      to,
      text: signedText(s.sign, Math.abs(s.signed), undefined),
    });
    running = to;
  }
  bars.push({
    kind: "end",
    label: t.end.label,
    remainder: false,
    sign: t.end.value < 0 ? "negative" : t.end.value > 0 ? "positive" : "zero",
    from: 0,
    to: t.end.value,
    text: totalText(t.end.value, undefined),
  });
  return bars;
}

/** Break a label on spaces into lines of at most `max` characters (a long word keeps its own line). */
export function wrapLabel(label: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of label.split(/\s+/).filter((w) => w !== "")) {
    if (line !== "" && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines.length > 0 ? lines : [label];
}
