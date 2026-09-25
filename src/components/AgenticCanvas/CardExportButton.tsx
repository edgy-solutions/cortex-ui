import { useCallback, useState, type RefObject } from "react";
import { Download } from "lucide-react";
import type { Artifact } from "@/api/types";
import {
  buildCardExportHtml,
  exportFileName,
  readExportProvenance,
  readMethod,
} from "@/lib/cardExport";
import { captureCardHtml, collectDocumentCss, downloadHtmlFile } from "@/lib/cardExportCapture";
import { answerSPO } from "@/lib/answerDisplay";

/**
 * EXPORT THIS CARD — the action, beside the card's other header actions.
 *
 * All the decisions live in `@/lib/cardExport` (pure, sealed) and `@/lib/cardExportCapture`
 * (DOM, thin). This component's whole job is to gather four things at the moment of the click and
 * hand them over. It is a click handler with a tooltip, and that is deliberate: an export whose
 * logic lived here would be testable only by driving a browser.
 *
 * ── WHERE THE PAYLOAD COMES FROM, AND WHY THAT CHOICE ─────────────────────────────────────
 *
 * `rendered_output.components` is the array the card was drawn from. A single-component answer —
 * which is every archetype in this registry today — exports as THE COMPONENT ITSELF, so the paths
 * in the table read `rows[0].contribution` and match how the producer talks about its own payload.
 * A multi-component answer exports the whole array, paths reading `[0].rows[0]…`, because picking
 * one of several and calling it "the payload" would silently drop the rest.
 *
 * ── WHERE `method` IS LOOKED FOR ──────────────────────────────────────────────────────────
 *
 * Nowhere yet: `method` is in no wire type and no captured payload as of 2026-09-24. The order it
 * was built for says it "arrives from the worker tonight" and does not say at which level, so both
 * plausible levels are READ and neither is invented — the component payload first (where the
 * projector puts per-archetype fields), then the `rendered_output` envelope. If it arrives
 * somewhere else this finds nothing, and the export says "method not supplied", which is the
 * correct rendering of a field this UI cannot see. It is not the correct rendering of a field the
 * producer sent, so the day the worker lands, this is the line to check first.
 */
export function CardExportButton({
  artifact,
  bodyRef,
  className,
}: {
  artifact: Artifact;
  /** The card's body element. Captured verbatim as "the card as rendered". */
  bodyRef: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const onExport = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const components = artifact.rendered_output?.components ?? [];
        const payload = components.length === 1 ? components[0] : components;

        const componentLevel = (components[0] ?? null) as { method?: unknown } | null;
        const envelopeLevel = artifact.rendered_output as { method?: unknown } | undefined;
        const method =
          readMethod(componentLevel?.method) ?? readMethod(envelopeLevel?.method) ?? null;

        const spo = answerSPO(artifact);
        const title =
          [spo.subjectLabel, spo.verbLabel].filter(Boolean).join(" · ") ||
          artifact.question_text ||
          "card";
        const now = new Date();

        const html = buildCardExportHtml({
          title,
          archetype: artifact.rendered_output?.archetype ?? null,
          cardHtml: captureCardHtml(bodyRef.current),
          css: collectDocumentCss(),
          payload,
          method,
          provenance: readExportProvenance(artifact),
          exportedAt: now.toISOString(),
        });

        downloadHtmlFile(exportFileName(title, now), html);
        setFailed(false);
      } catch {
        // A FAILED EXPORT MUST SAY SO ON THE BUTTON. The previous shape of this was a silent
        // catch, and a click that produces no file and no complaint reads as "nothing to export".
        setFailed(true);
      }
    },
    [artifact, bodyRef],
  );

  return (
    <button
      // Same gesture contract as the remove button beside it: the header is a move handle, so a
      // press here must not also start a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onExport}
      className={`flex-shrink-0 ${
        failed ? "text-rose-400" : "text-slate-600 hover:text-neon-cyan"
      } ${className ?? ""}`}
      title={failed ? "Export failed — nothing was written" : "Export as a self-contained HTML file"}
      aria-label="Export card as HTML"
      data-cx-export-failed={failed ? "true" : undefined}
    >
      <Download className="w-3.5 h-3.5" />
    </button>
  );
}
