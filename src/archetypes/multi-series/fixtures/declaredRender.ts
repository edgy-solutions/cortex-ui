/**
 * WHAT A DECLARED MEASURE ARRIVES AS: the component `_project_planning_archetype` emits for a
 * `render.shape: MULTI_SERIES` measure row (`fin_tcpi`, `fin_vac`), key for key.
 *
 * The projector carries `series`, `reference`, `verdict`, `value_label`, `scope_label` and the
 * rows, and NOT the row's `render` block. `reference` is the row's `render.target` (the producer
 * copies it with `reference=dict(rnd["target"])`), so it is `{value, label}`. `verdict` is
 * `declared_verdict`'s mechanical line. `subject_concept` is the projector's unconditional key and
 * no reader of this card claims it; every captured MULTI_SERIES has it null. Ruled 2026-11-03: the
 * projector will omit it when null, so these two keys go at the re-pin that crosses that. The seal
 * (`src/lib/presentationProvenance.producerSeal.test.ts`) compares `series`, `reference` and
 * `value_label` here to the yaml rows themselves.
 *
 * NOT in `./index.ts`: that is the population the parity and absence seals walk, and these add
 * no new absence; `declaredRender.test.tsx` is their only reader.
 */

/** `fin_tcpi.yaml`: `series: [{key: tcpi, label: TCPI}]` (dimensionless), `target: {value: 1.0, ...}`. */
export const DECLARED_TCPI_COMPONENT = {
  archetype: "MULTI_SERIES",
  source_persona: "finance",
  subject_concept: null,
  rows: [
    { period: "2026-01", tcpi: 0.91 },
    { period: "2026-02", tcpi: 0.94 },
    { period: "2026-03", tcpi: 0.97 },
  ],
  series: [{ key: "tcpi", label: "TCPI" }],
  reference: { value: 1.0, label: "at budgeted efficiency" },
  verdict: "TCPI 0.97, below 1.0 (at budgeted efficiency) at 2026-03",
  value_label: "TCPI",
} as const;

/** `fin_vac.yaml`: `series: [{key: vac, label: VAC, unit: USD}]`, `target: {value: 0, label: on budget}`. */
export const DECLARED_VAC_COMPONENT = {
  archetype: "MULTI_SERIES",
  source_persona: "finance",
  subject_concept: null,
  rows: [
    { period: "2026-01", vac: 1200 },
    { period: "2026-02", vac: -400 },
    { period: "2026-03", vac: -1500 },
  ],
  series: [{ key: "vac", label: "VAC", unit: "USD" }],
  reference: { value: 0, label: "on budget" },
  verdict: "VAC -1500.00, below 0 (on budget) at 2026-03",
  value_label: "VAC",
} as const;
