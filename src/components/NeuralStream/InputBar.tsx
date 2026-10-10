import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "react-oidc-context";
import { motion } from "framer-motion";
import { Paperclip, Send, Wifi, WifiOff, X } from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { useComposerDraft } from "@/hooks/useComposerDraft";
import { useInterviewStore } from "@/store/useInterviewStore";
import { PersonaPicker } from "@/components/PersonaPicker";
import { KindPicker } from "@/components/ingest/KindPicker";
import { IngestDragOverlay } from "@/components/ingest/IngestDragOverlay";
import { carriesFiles } from "@/lib/fileDropGuard";
import { isIngestUiEnabled } from "@/lib/ingestFlag";
import { INGEST_ACCEPT } from "@/lib/ingestAccept";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";

export function InputBar() {
  // Draft-backed instead of plain useState: a failed silent renew unmounts this whole
  // surface and bounces to Keycloak, and the typed prompt used to die with it.
  const { value, setValue, clearDraft } = useComposerDraft();
  const { sendMessage, isConnected, isProcessing } = useAgent();
  const phase = useInterviewStore((s) => s.phase);

  // "The drop is the prompt": a dropped/chosen file becomes a chip here and Send submits an
  // INGEST turn (POST /ingest), not an /interview question. See useIngestComposerStore.
  const ingestEnabled = isIngestUiEnabled();
  const auth = useAuth();
  // on_behalf_of must equal the caller's authz_id; the OIDC profile email is that value only
  // while USER_ENTITLEMENT_CLAIM stays "email" (the same coincidence IngestPanel documented).
  const email = auth.user?.profile.email ?? null;
  const chipFile = useIngestComposerStore((s) => s.file);
  const chipKind = useIngestComposerStore((s) => s.kind);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasChip = ingestEnabled && chipFile !== null;

  // Every drag handler cancels AND stops (P0 2026-10-08): an uncancelled file drop navigates
  // the tab, and an ancestor's handler must not get a say.
  const holdDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragEnterOver = (e: DragEvent) => {
    holdDrag(e);
    if (ingestEnabled && carriesFiles(e.nativeEvent)) setDragActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    holdDrag(e);
    // Moving between the composer's own children is not a leave.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };
  const onDrop = (e: DragEvent) => {
    holdDrag(e);
    setDragActive(false);
    if (!ingestEnabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) useIngestComposerStore.getState().attach(f);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (hasChip) {
      // An ingest turn: needs the human-confirmed kind and a verified email; never an interview.
      if (!chipKind || !email) return;
      void useIngestComposerStore.getState().submit(email, value.trim());
      clearDraft();
      return;
    }
    // Early return leaves the draft on disk — a submit that never dispatched has not
    // consumed the text, and clearing here would delete work the user still owes an attempt.
    if (!value.trim() || phase !== "active" || isProcessing) return;
    sendMessage(value.trim());
    clearDraft();
  };

  // Disable while a stream is in flight to prevent spam-submits. The deeper
  // mutation guard in useInterviewAgent will silently no-op duplicates, but
  // surfacing the disabled state here makes the rate-limit visible to the
  // user instead of a button that looks active but does nothing.
  const isDisabled = phase !== "active" || isProcessing;
  const sendDisabled = hasChip ? !chipKind || !email : !value.trim() || isDisabled;

  return (
    <div className="px-6 pb-5 pt-2">
      {/* Portalled: the form below carries a transform, which would re-anchor `fixed`. */}
      {ingestEnabled && createPortal(<IngestDragOverlay />, document.body)}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="relative"
      >
        {/* Outer glow ring */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-blue/20 via-neon-purple/20 to-neon-blue/20 rounded-2xl blur-sm" />

        <div
          data-ingest-composer
          data-drag-active={dragActive ? "true" : "false"}
          onDragEnter={onDragEnterOver}
          onDragOver={onDragEnterOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative glass-panel flex flex-col gap-2 p-2 pl-4 transition-all duration-200 ${
            dragActive
              ? "z-[70] min-h-[9rem] justify-center border-2 border-neon-cyan shadow-[0_0_24px_rgba(0,240,255,0.35)]"
              : ""
          }`}
        >
          {hasChip && chipFile && (
            <div className="flex items-center gap-3 flex-wrap" data-ingest-chip-row>
              <span
                data-ingest-chip
                className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-xs font-mono text-slate-200"
              >
                <Paperclip className="w-3 h-3 text-neon-cyan/70 flex-shrink-0" />
                <span className="truncate" data-ingest-chip-name>
                  {chipFile.name}
                </span>
                <button
                  type="button"
                  aria-label="Remove attached document"
                  data-ingest-chip-remove
                  onClick={() => useIngestComposerStore.getState().clearDraft()}
                  className="text-slate-400 hover:text-slate-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
              {/* Keyed on the file so a re-attach resets the radios along with the store's kind. */}
              <KindPicker
                key={`${chipFile.name}:${chipFile.size}:${chipFile.lastModified}`}
                inline
                onConfirm={() => {}}
                onSelect={(k) => useIngestComposerStore.getState().setKind(k)}
                blockedReason={
                  email ? null : "No verified email available — upload is disabled until one is."
                }
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Connection status indicator */}
            {isConnected ? (
              <Wifi className="w-4 h-4 text-neon-green/70 flex-shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-slate-500 flex-shrink-0" />
            )}
            {/* ADR-0026 picker — the bolt glyph IS the persona/domain
              trigger (design option 2e). Hover → label pill; click →
              two-column palette opening upward. Replaces the former
              static Zap glyph + the exposed dropdown row. */}
            <PersonaPicker />

            {/* min-w-0 on the input is load-bearing: without it the input
              keeps its intrinsic min content-width and refuses to
              shrink, so when the picker's label pill expands the flex
              row overflows and pushes the send button off the composer.
              min-w-0 lets flex-1 actually absorb the pill's growth. */}
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={hasChip ? false : isDisabled}
              placeholder={
                hasChip
                  ? "Add a note (optional), pick a kind, then send..."
                  : isProcessing
                    ? "Streaming response — please wait..."
                    : phase !== "active"
                      ? "Interview complete — compile the workflow"
                      : isConnected
                        ? "Connected to mesh — begin interrogation..."
                        : "Offline mode — begin interrogation..."
              }
              className="flex-1 min-w-0 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 font-mono outline-none disabled:opacity-40"
            />

            {ingestEnabled && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={INGEST_ACCEPT}
                  className="hidden"
                  data-ingest-file-input
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) useIngestComposerStore.getState().attach(f);
                    // Choosing the same file twice in a row fires no change unless the value resets.
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-label="Attach a document"
                  data-ingest-attach
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-shrink-0 w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-neon-cyan transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="submit"
              aria-label="Send"
              disabled={sendDisabled}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue hover:bg-neon-blue/20 hover:neon-glow-blue transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
