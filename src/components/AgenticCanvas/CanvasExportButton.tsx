import { useCallback, useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import {
  fetchExportRecipients,
  startCanvasExport,
  downloadExportArtifact,
} from "@/api/client";
import {
  artifactLink,
  canvasAnswerIds,
  isCanvasExportEnabled,
  readCanvasExport,
  readRecipientRequired,
  type CanvasExport,
  type ExportRecipient,
} from "@/lib/canvasExport";

/**
 * EXPORT — the canvas-level control, replacing the per-card export as the server route lands
 * (`CardExportButton.tsx`'s header comment). Wired against the REAL route, invincible-agent
 * origin/master `3f27c7cb`: `GET /export/package/recipients`, `POST /export/package`, and the
 * download proxy `GET /export/package/artifact/{filename}`. Still behind `isCanvasExportEnabled()`
 * — the flag stays until a live capture against this route seals it.
 *
 * ── SYNCHRONOUS, NO POLLING ────────────────────────────────────────────────────────────────
 *
 * `3f27c7cb` builds the package inline and returns `"exists"` or `"failed"` in the SAME response
 * that asked for it — there is no job id to poll and no GET-by-id. One POST gives one result.
 *
 * ── NO DEFAULT RECIPIENT (ADR-0047 §1) ────────────────────────────────────────────────────
 *
 * The picker never pre-selects an option. Guessing an audience is the thing the ruling forbids,
 * so "start" stays disabled until a person picks one — including in the 409 `recipient_required`
 * arm, which reuses the same picker with the server's own options.
 *
 * ── NO template_id ─────────────────────────────────────────────────────────────────────────
 *
 * The canvas carries no template binding to read (packet §C is the ingest half, not this one;
 * slice 1 of the export route itself takes `template_id` only to echo it back — see 3f27c7cb's
 * `ExportPackageRequest`). Nothing here has a value to send, so the field is omitted.
 *
 * ── LANE 1'S LIVE CAPTURE SEALS THE REFUSAL HALF ONLY ─────────────────────────────────────
 *
 * `sessions/2026-10-01-payload-export-package-roll-11.json` witnessed the recipients list, the
 * 409 `recipient_required` shape, and a `status: "failed"` response carrying the new `outcome`
 * field (drawn below as `data-export-outcome`) — the live engine cannot import `agent_fleet`, so
 * every observed POST has failed. No `"exists"` response has been witnessed; the flag
 * (`isCanvasExportEnabled()`) stays until one is.
 */
export function CanvasExportButton() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const answerIds = canvasAnswerIds(artifacts);

  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<ExportRecipient[] | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [exportRow, setExportRow] = useState<CanvasExport | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const openPicker = useCallback(async () => {
    setOpen(true);
    setErrorText(null);
    setExportRow(null);
    if (recipients) return;
    setLoadingRecipients(true);
    try {
      const got = await fetchExportRecipients();
      setRecipients(got);
    } catch {
      setErrorText("Could not load recipients.");
    } finally {
      setLoadingRecipients(false);
    }
  }, [recipients]);

  const onStart = useCallback(async () => {
    if (!selected) return;
    setStarting(true);
    setErrorText(null);
    try {
      const raw = await startCanvasExport({
        answers: answerIds.map((artifact_id) => ({ artifact_id })),
        recipient_scope: selected,
      });
      const row = readCanvasExport(raw);
      if (!row) {
        setErrorText("Export finished but the response could not be read.");
        return;
      }
      setExportRow(row);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
        const status = err.response?.status;
        // `readRecipientRequired` is `null` on a malformed 409 (the reason present but garbage
        // options, or anything else) — that falls through to the generic error text below
        // instead of seeding the picker with an empty or garbage list.
        const required = status === 409 ? readRecipientRequired(detail) : null;
        if (required) {
          setRecipients(required);
          setSelected(null);
          setErrorText("Pick a recipient.");
        } else if (status === 403 && isRecord(detail) && typeof detail.recipient_scope === "string") {
          setErrorText(`You may not export to ${detail.recipient_scope}.`);
        } else if (isRecord(detail)) {
          const msg =
            (typeof detail.reason === "string" && detail.reason) ||
            (typeof detail.error === "string" && detail.error) ||
            (typeof detail.message === "string" && detail.message) ||
            `Export failed (${status ?? "unknown"}).`;
          setErrorText(String(msg));
        } else if (typeof detail === "string") {
          setErrorText(detail);
        } else {
          setErrorText(`Export failed (${status ?? "unknown"}).`);
        }
      } else {
        setErrorText("Export failed to start — network error.");
      }
    } finally {
      setStarting(false);
    }
  }, [selected, answerIds]);

  const onDownload = useCallback(async () => {
    const link = exportRow ? artifactLink(exportRow) : null;
    if (!link) return;
    setDownloading(true);
    setErrorText(null);
    try {
      const blob = await downloadExportArtifact(link.href);
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = link.filename ?? "export";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setErrorText("Download failed.");
    } finally {
      setDownloading(false);
    }
  }, [exportRow]);

  if (!isCanvasExportEnabled()) return null;

  const noAnswers = answerIds.length === 0;
  const link = exportRow ? artifactLink(exportRow) : null;

  return (
    <div
      data-overlay
      className="absolute bottom-20 right-3 z-20 flex flex-col items-end gap-1.5"
    >
      <button
        data-canvas-export
        disabled={noAnswers}
        onClick={() => (open ? setOpen(false) : void openPicker())}
        title={noAnswers ? "No answers on this canvas to export" : undefined}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider shadow-lg backdrop-blur-sm transition-colors ${
          noAnswers
            ? "border-slate-700/40 bg-slate-950/60 text-slate-600 cursor-not-allowed"
            : "border-neon-cyan/40 bg-slate-950/85 text-neon-cyan hover:bg-neon-cyan/10"
        }`}
      >
        <Download className="w-2.5 h-2.5" />
        Export
      </button>

      {noAnswers && (
        <div className="text-[9px] font-mono text-slate-600 max-w-[220px] text-right">
          Add an answer to this canvas before exporting.
        </div>
      )}

      {open && !noAnswers && (
        <div className="w-64 rounded-lg border border-neon-cyan/30 bg-slate-950/95 backdrop-blur-sm p-3 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            Export {answerIds.length} answer{answerIds.length === 1 ? "" : "s"} to…
          </div>

          {loadingRecipients && (
            <div className="text-[9px] font-mono text-slate-500">Loading recipients…</div>
          )}

          {!loadingRecipients && recipients && recipients.length > 0 && (
            <div className="flex flex-col gap-1 mb-2">
              {recipients.map((r) => (
                <button
                  key={r.value}
                  data-export-recipient={r.value}
                  onClick={() => setSelected(r.value)}
                  className={`text-left rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                    selected === r.value
                      ? "border-neon-cyan/60 bg-neon-cyan/10 text-neon-cyan"
                      : "border-slate-700/50 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {!loadingRecipients && recipients && recipients.length === 0 && (
            <div className="text-[9px] font-mono text-slate-500 mb-2">
              No recipients available.
            </div>
          )}

          {errorText && (
            <div data-export-error className="text-[9px] font-mono text-rose-400 mb-2">
              {errorText}
            </div>
          )}

          {!exportRow && (
            <button
              onClick={() => void onStart()}
              disabled={!selected || starting}
              className={`w-full rounded-md px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider border transition-colors ${
                !selected || starting
                  ? "border-slate-700/40 text-slate-600 cursor-not-allowed"
                  : "border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10"
              }`}
            >
              {starting ? "Starting…" : "Start export"}
            </button>
          )}

          {exportRow && (
            <div className="mt-1 flex flex-col gap-1">
              <div data-export-status className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                {exportRow.status}
                {exportRow.status === "failed" && exportRow.reason ? ` — ${exportRow.reason}` : ""}
              </div>
              {exportRow.status === "failed" && exportRow.outcome && (
                <div data-export-outcome className="text-[8px] font-mono text-slate-500">
                  {exportRow.outcome}
                </div>
              )}
              {exportRow.lots_disclosed && exportRow.lots_disclosed.length > 0 && (
                <div data-export-lots className="text-[8px] font-mono text-slate-500">
                  Lots: {exportRow.lots_disclosed.join(", ")}
                </div>
              )}
              {exportRow.sections && exportRow.sections.length > 0 && (
                <div data-export-sections className="text-[8px] font-mono text-slate-500">
                  Sections: {exportRow.sections.join(", ")}
                </div>
              )}
              {link && (
                <div className="flex items-center gap-2">
                  <a
                    data-export-artifact
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      void onDownload();
                    }}
                    className="text-[10px] font-mono text-neon-cyan underline"
                  >
                    {downloading ? "Downloading…" : (link.filename ?? "Download")}
                  </a>
                  <span data-export-sha className="text-[8px] font-mono text-slate-500">
                    {link.sha256}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
