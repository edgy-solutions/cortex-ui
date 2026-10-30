import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "react-oidc-context";
import { motion } from "framer-motion";
import { Paperclip, Send, Wifi, WifiOff, X } from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { useComposerDraft } from "@/hooks/useComposerDraft";
import { PersonaPicker } from "@/components/PersonaPicker";
import { KindPicker } from "@/components/ingest/KindPicker";
import { DropLeafRow } from "@/components/ingest/DropLeafRow";
import { IngestDragOverlay } from "@/components/ingest/IngestDragOverlay";
import { carriesFiles, DRAG_IDLE_MS } from "@/lib/fileDropGuard";
import { isIngestUiEnabled } from "@/lib/ingestFlag";
import { INGEST_ACCEPT } from "@/lib/ingestAccept";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useIngestComposerStore, dropReady, leafAsked, offeredDropLeaves } from "@/store/useIngestComposerStore";
import { useComposerPrefillStore } from "@/store/useComposerPrefillStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { ingestComponentFrom, ingestInFlight } from "@/lib/ingestArtifact";
import { NO_DROP_IDENTITY } from "@/lib/dropIdentity";
import { useDropIdentity } from "@/hooks/useDropIdentity";

export function InputBar() {
  // Draft-backed instead of plain useState: a failed silent renew unmounts this whole
  // surface and bounces to Keycloak, and the typed prompt used to die with it.
  const { value, setValue, clearDraft } = useComposerDraft();
  const { sendMessage, isConnected, isProcessing } = useAgent();
  const textInputRef = useRef<HTMLInputElement>(null);

  // The `/ask?q=` deep link: the question is TYPED into the composer and nothing is sent. Replaces
  // any existing draft (the link is the person's explicit intent). The draft restore keeps a
  // non-empty current value, so this survives it whichever of the two runs first.
  const prefill = useComposerPrefillStore((s) => s.text);
  useEffect(() => {
    if (prefill === null) return;
    const t = useComposerPrefillStore.getState().take();
    if (t !== null) {
      setValue(t);
      textInputRef.current?.focus();
    }
  }, [prefill, setValue]);

  // "The drop is the prompt": a dropped/chosen file becomes a chip here and Send submits an
  // INGEST turn (POST /ingest), not an /interview question. See useIngestComposerStore.
  const ingestEnabled = isIngestUiEnabled();
  const auth = useAuth();
  const entitlements = usePersonaStore((s) => s.entitlements);
  // on_behalf_of must equal the caller's authz_id — read from /me/entitlements, NOT the OIDC email,
  // which equals it only while USER_ENTITLEMENT_CLAIM stays "email" (not at work). See dropIdentity.
  const onBehalfOf = useDropIdentity();
  const chipFile = useIngestComposerStore((s) => s.file);
  const chipKind = useIngestComposerStore((s) => s.kind);
  const chipInferred = useIngestComposerStore((s) => s.inferred);
  const chipLeaf = useIngestComposerStore((s) => s.leaf);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasChip = ingestEnabled && chipFile !== null;
  // Drops in flight: the rail's own entries (uploading + not yet terminal), counted off the one
  // place they live. The count is a number, so the selector returns a primitive.
  const inflight = useCanvasStore((s) =>
    s.artifacts.reduce((n, a) => {
      const c = ingestComponentFrom(a);
      return c && ingestInFlight(c) ? n + 1 : n;
    }, 0),
  );

  // Every drag handler cancels AND stops (P0 2026-10-08): an uncancelled file drop navigates
  // the tab, and an ancestor's handler must not get a say.
  const holdDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  // "Stuck big" must be impossible: every Files enter/over (re)arms a watchdog that clears the
  // grown state once dragovers stop, so no missing dragleave can strand it.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearActive = useCallback(() => {
    if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    setDragActive(false);
  }, []);
  useEffect(() => {
    // Capture on window: the composer stops propagation of its own drag events (P0 2026-10-08),
    // and a drop elsewhere, a cancelled drag, or the pointer leaving the window never reaches it.
    const onLeaveWindow = (e: globalThis.DragEvent) => {
      if (!e.relatedTarget) clearActive();
    };
    window.addEventListener("drop", clearActive, true);
    window.addEventListener("dragend", clearActive, true);
    window.addEventListener("dragleave", onLeaveWindow, true);
    return () => {
      window.removeEventListener("drop", clearActive, true);
      window.removeEventListener("dragend", clearActive, true);
      window.removeEventListener("dragleave", onLeaveWindow, true);
      if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    };
  }, [clearActive]);
  const onDragEnterOver = (e: DragEvent) => {
    holdDrag(e);
    if (!ingestEnabled || !carriesFiles(e.nativeEvent)) return;
    setDragActive(true);
    if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(clearActive, DRAG_IDLE_MS);
  };
  const onDragLeave = (e: DragEvent) => {
    holdDrag(e);
    // Moving between the composer's own children is not a leave.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    clearActive();
  };
  const onDrop = (e: DragEvent) => {
    holdDrag(e);
    clearActive();
    if (!ingestEnabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) useIngestComposerStore.getState().attach(f);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (hasChip) {
      // An ingest turn: needs the human-confirmed kind and a drop identity; never an interview.
      if (!dropReady({ file: chipFile, kind: chipKind, leaf: chipLeaf }) || !onBehalfOf) return;
      void useIngestComposerStore.getState().submit(onBehalfOf, value.trim(), auth.user?.profile?.sub ?? null);
      clearDraft();
      return;
    }
    // Early return leaves the draft on disk — a submit that never dispatched has not
    // consumed the text, and clearing here would delete work the user still owes an attempt.
    if (!value.trim() || isProcessing) return;
    sendMessage(value.trim());
    clearDraft();
  };

  // Disable while a stream is in flight to prevent spam-submits. The deeper
  // mutation guard in useInterviewAgent will silently no-op duplicates, but
  // surfacing the disabled state here makes the rate-limit visible to the
  // user instead of a button that looks active but does nothing.
  const isDisabled = isProcessing;
  const sendDisabled = hasChip ? !(dropReady({ file: chipFile, kind: chipKind, leaf: chipLeaf }) && onBehalfOf) : !value.trim() || isDisabled;

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
              {/* The kind is read off the file (extension + magic bytes). A picker appears ONLY when
                  that is ambiguous. Keyed on the file so a re-attach resets the radios. */}
              {chipInferred === null ? (
                <span className="text-[10px] font-mono text-slate-500" data-ingest-kind-pending>
                  Detecting kind…
                </span>
              ) : chipInferred.ambiguous ? (
                <>
                  <p className="text-[10px] font-mono text-amber-400" data-ingest-kind-reason>
                    {chipInferred.reason}
                  </p>
                  <KindPicker
                    key={`${chipFile.name}:${chipFile.size}:${chipFile.lastModified}`}
                    inline
                    sniffedKind={chipInferred.sniffed}
                    onConfirm={() => {}}
                    onSelect={(k) => useIngestComposerStore.getState().setKind(k)}
                    blockedReason={
                      onBehalfOf ? null : NO_DROP_IDENTITY
                    }
                  />
                </>
              ) : (
                <>
                  <span
                    className="text-[11px] font-mono text-neon-cyan/80 uppercase"
                    data-ingest-kind-inferred={chipInferred.kind}
                  >
                    {chipInferred.kind} · detected
                  </span>
                  {!onBehalfOf && (
                    <p className="text-[10px] font-mono text-amber-400" data-ingest-kind-blocked>
                      {NO_DROP_IDENTITY}
                    </p>
                  )}
                </>
              )}
              {hasChip && leafAsked(chipKind) && (
                <DropLeafRow leaves={offeredDropLeaves(entitlements)} value={chipLeaf} onChange={(c) => useIngestComposerStore.getState().setLeaf(c)} />
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* [wifi][bolt][clip·n]: one tight group of three plain indicators at the left. */}
            <div className="flex items-center gap-2">
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
              {ingestEnabled && (
                <span className="relative inline-flex">
                  <button
                    type="button"
                    aria-label="Attach a document"
                    data-ingest-attach
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 flex items-center text-slate-400 hover:text-neon-cyan transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  {inflight > 0 && (
                    <button
                      type="button"
                      aria-label={`${inflight} document${inflight === 1 ? "" : "s"} in flight — show them`}
                      data-ingest-inflight-badge
                      onClick={(e) => {
                        // The badge filters the rail; it must not also open the file picker.
                        e.stopPropagation();
                        useAnswerPanelStore.getState().setTypeFilter("INGEST");
                      }}
                      className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-neon-cyan/20 border border-neon-cyan/40 text-[9px] leading-[12px] font-mono text-neon-cyan flex items-center justify-center"
                    >
                      {inflight}
                    </button>
                  )}
                </span>
              )}
            </div>

            {/* min-w-0 on the input is load-bearing: without it the input
              keeps its intrinsic min content-width and refuses to
              shrink, so when the picker's label pill expands the flex
              row overflows and pushes the send button off the composer.
              min-w-0 lets flex-1 actually absorb the pill's growth. */}
            <input
              ref={textInputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={hasChip ? false : isDisabled}
              placeholder={
                hasChip
                  ? "Add a note (optional), then send..."
                  : isProcessing
                    ? "Streaming response — please wait..."
                    : isConnected
                      ? "Connected to mesh — begin interrogation..."
                      : "Offline mode — begin interrogation..."
              }
              className="flex-1 min-w-0 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 font-mono outline-none disabled:opacity-40"
            />

            {ingestEnabled && (
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
