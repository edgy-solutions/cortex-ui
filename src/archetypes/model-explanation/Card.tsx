import { MODEL_QUESTIONS, MODEL_QUESTION_LABEL, type ModelExplanation as Payload, type ModelProperty } from "./contract";
import { readAnswers } from "./questionState";
import { readBounds } from "./bounds";

/**
 * MODEL_EXPLANATION — cortex-proposed (see `contract.ts`'s header: no producer serves this).
 * READ-ONLY: the model never changes from a conversation (ADR-0057 §3/§4), so there is no
 * button, input, drag or edit here. Nothing is clickable, so nothing is a bordered chip
 * (directive 2026-10-17: bordered = clickable) — super classes, ranges and domains are muted text.
 *
 * The card keeps three things apart that a careless card would merge: answered (with WHERE the
 * model says it), deferred (a declared absence, with its reason) and not recorded.
 */

const nonBlank = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

function Cardinality({ p }: { p: ModelProperty }) {
  const b = readBounds(p);
  if (b.state === "stated") return <td className="text-slate-400">{b.text}</td>;
  if (b.state === "part-stated")
    return (
      <td className="text-slate-400" data-model-cardinality="part-stated" title="? = the model states no bound">
        {b.text}
      </td>
    );
  if (b.state === "not-stated")
    return (
      <td className="text-slate-500 italic" data-model-cardinality="not-stated">
        Not stated in the model
      </td>
    );
  return (
    <td className="text-amber-400/80" data-model-cardinality="unreadable">
      Unreadable bound — not shown as one.
    </td>
  );
}

export function ModelExplanation({ model_explanation }: { model_explanation: Payload }) {
  const m = model_explanation;
  const subject = m.subject;
  const kind = subject.kind;
  const isClass = kind === "class";
  const unknownKind = kind !== "class" && kind !== "property";
  const kindWord = kind === "class" ? "Class" : kind === "property" ? "Property" : `kind not known: ${kind}`;
  const title = nonBlank(subject.label) ? subject.label : subject.iri;
  const { byQuestion, unknownKeys } = readAnswers(m.answers);

  const counts = { answered: 0, deferred: 0, "not-recorded": 0, unreadable: 0 };
  for (const q of MODEL_QUESTIONS) counts[byQuestion[q].state]++;

  const supers = (m.super_classes ?? []).map((t) => (nonBlank(t.label) ? t.label : t.iri));
  const props = m.properties ?? [];

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-slate-700/50 bg-slate-900/40 p-3"
      data-archetype="MODEL_EXPLANATION"
      {...(unknownKind ? { "data-model-subject": "unknown-kind" } : {})}
    >
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{kindWord}</p>
        <h3 className="font-mono text-sm text-slate-200">{title}</h3>
        <p className="font-mono text-[10px] text-slate-500">{subject.iri}</p>
      </div>

      {nonBlank(subject.definition) ? (
        <p className="text-xs text-slate-300">{subject.definition}</p>
      ) : (
        <p className="text-xs text-slate-500" data-model-definition="none">
          No definition in the ratified model.
        </p>
      )}

      {nonBlank(m.ratified_at) ? (
        <p className="font-mono text-[10px] text-slate-400" title={m.ratified_at}>
          Ratified model @ {m.ratified_at.slice(0, 8)}
        </p>
      ) : (
        <p className="font-mono text-[10px] text-slate-500" data-model-ratified="unstated">
          Which ratified model answered: not stated.
        </p>
      )}

      {supers.length > 0 && (
        <p className="font-mono text-[10px] text-slate-500">Super classes: {supers.join(", ")}</p>
      )}

      {isClass &&
        (props.length > 0 ? (
          <table className="w-full text-left font-mono text-[11px] text-slate-300">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="pr-2 font-normal">Property</th>
                <th className="pr-2 font-normal">Range</th>
                <th className="font-normal">Cardinality</th>
              </tr>
            </thead>
            <tbody>
              {props.map((p) => (
                <tr key={p.iri}>
                  <td className="pr-2">{nonBlank(p.label) ? p.label : p.iri}</td>
                  <td className="pr-2 text-slate-500">{nonBlank(p.range) ? p.range : ""}</td>
                  <Cardinality p={p} />
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-slate-500" data-model-properties="none">
            No properties in the ratified model.
          </p>
        ))}

      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] text-slate-500">
          {counts.answered} answered · {counts.deferred} deferred · {counts["not-recorded"]} not recorded
          {counts.unreadable > 0 ? ` · ${counts.unreadable} unreadable` : ""}
        </p>
        <table className="w-full text-left text-xs text-slate-300">
          <tbody>
            {MODEL_QUESTIONS.map((q) => {
              const a = byQuestion[q];
              return (
                <tr
                  key={q}
                  className="align-top"
                  data-model-question={a.state}
                  data-question={q}
                >
                  <td className="py-1 pr-3 font-mono text-[10px] text-slate-400">{MODEL_QUESTION_LABEL[q]}</td>
                  <td className="py-1">
                    {a.state === "answered" && (
                      <>
                        <p>{a.value}</p>
                        {a.source ? (
                          <p className="font-mono text-[10px] text-slate-500">from {a.source}</p>
                        ) : (
                          <p className="font-mono text-[10px] text-slate-500" data-model-answer-source="none">
                            source not given
                          </p>
                        )}
                      </>
                    )}
                    {a.state === "deferred" && <p className="text-amber-400/80">Deferred: {a.reason}</p>}
                    {a.state === "not-recorded" && (
                      <p className="text-slate-500">Not recorded in the ratified model.</p>
                    )}
                    {a.state === "unreadable" && (
                      <p className="text-slate-500">
                        {a.missing ? "Not on the wire — unreadable." : "Unreadable answer — not shown as one."}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unknownKeys.length > 0 && (
        <p className="font-mono text-[10px] text-slate-500" data-model-questions="unknown-keys">
          {unknownKeys.length} answer(s) to questions this card does not know: {unknownKeys.join(", ")}
        </p>
      )}

      <p className="font-mono text-[10px] text-slate-500">
        Read-only. The model changes only through a reviewed proposal (ADR-0057 §4).
      </p>
    </section>
  );
}
