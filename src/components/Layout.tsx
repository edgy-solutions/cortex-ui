import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Brain, Minimize2, Maximize2 } from "lucide-react";
import { usePresentationStore, railOpen, revealRightOnSelection } from "@/store/usePresentationStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { RailStrip } from "@/components/RailStrip";
import { NodeInspector } from "@/components/AgenticCanvas/NodeInspector";
import { UserMenu } from "@/components/UserMenu";
import { HumanTaskInboxBadge } from "@/components/HumanTaskInbox/HumanTaskInboxBadge";

interface LayoutProps {
  stream: ReactNode;
  canvas: ReactNode;
  hud: ReactNode;
}

export function Layout({ stream, canvas, hud }: LayoutProps) {
  const fullScreen = usePresentationStore((s) => s.fullScreen);
  const leftPinned = usePresentationStore((s) => s.leftPinned);
  const rightPinned = usePresentationStore((s) => s.rightPinned);
  const toggleFullScreen = usePresentationStore((s) => s.toggleFullScreen);
  const toggleLeft = usePresentationStore((s) => s.toggleLeft);
  const toggleRight = usePresentationStore((s) => s.toggleRight);

  // Hover is LOCAL: it is a transient property of the pointer, not a fact about the session,
  // and putting it in the store would make every mouse movement a state broadcast.
  const [leftHover, setLeftHover] = useState(false);
  const [rightHover, setRightHover] = useState(false);

  const answerCount = useCanvasStore((s) => s.artifacts.length);
  // CHANGING selection opens the HUD; merely having one does not. See the store.
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  revealRightOnSelection(currentArtifactId, fullScreen);

  const leftOpen = railOpen({ fullScreen, pinned: leftPinned, hovering: leftHover });
  const rightOpen = railOpen({ fullScreen, pinned: rightPinned, hovering: rightHover });

  return (
    <div className="h-full w-full flex flex-col bg-surface-dark overflow-hidden">
      {/* ── Header ──────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex items-center gap-3 px-6 py-4 border-b border-glass-border"
      >
        <div className="relative">
          <Brain className="w-7 h-7 text-neon-blue" />
          <div className="absolute inset-0 w-7 h-7 bg-neon-blue/20 rounded-full blur-lg animate-breathe" />
        </div>
        <h1 className="font-mono text-lg font-semibold tracking-wider text-slate-100 neon-text-blue">
          THE CORTEX
        </h1>
        <span className="ml-2 text-xs font-mono text-slate-500 tracking-widest uppercase">
          Agent Mesh Interface v2.0
        </span>

        <div className="ml-auto flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
            <span className="text-xs font-mono text-neon-green/80 uppercase tracking-widest">
              MESH ONLINE
            </span>
          </div>
          
          <HumanTaskInboxBadge />

          <div className="h-8 w-[1px] bg-glass-border" />

          <UserMenu />
        </div>
      </motion.header>

      {/* ── Main Grid ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Control Stream (Left Pane). In presentation mode it collapses to a labelled
            strip — hover peeks, the chevron pins. The PANE IS STILL MOUNTED when open, so
            nothing in it remounts or loses scroll on a peek. */}
        {fullScreen && !leftOpen ? (
          <div onMouseEnter={() => setLeftHover(true)}>
            <RailStrip
              label="Answers"
              count={answerCount}
              side="left"
              pinned={leftPinned}
              onToggle={toggleLeft}
            />
          </div>
        ) : (
          <motion.main
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            onMouseEnter={() => setLeftHover(true)}
            onMouseLeave={() => setLeftHover(false)}
            className="w-[30%] min-w-[350px] max-w-[450px] h-full flex flex-col border-r border-glass-border relative"
          >
            {stream}
            {fullScreen && (
              <button
                type="button"
                onClick={toggleLeft}
                title={leftPinned ? "Unpin answers" : "Pin answers open"}
                aria-label={leftPinned ? "Unpin answers" : "Pin answers open"}
                className="absolute top-2 right-2 z-10 text-slate-500 hover:text-neon-cyan"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.main>
        )}

        {/* Active Canvas (Middle Pane) - Flex width.
            `data-canvas-dropzone` marks this section as the drag target
            for answers dragged from the list — AnswerRow hit-tests the
            drop point against this element's bounds. */}
        <motion.section
          data-canvas-dropzone
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex-1 h-full min-w-0 relative overflow-hidden"
        >
          {canvas}
          {/* THE EXIT IS NEVER HOVER-ONLY. Drawn unconditionally, on the canvas rather than on
              a rail, so it is present whichever rail is collapsed and whoever is driving. */}
          <button
            type="button"
            onClick={toggleFullScreen}
            title={fullScreen ? "Exit full screen" : "Full screen"}
            aria-label={fullScreen ? "Exit full screen" : "Full screen"}
            data-mode-toggle
            className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded border border-glass-border bg-surface-dark/80 text-[9px] font-mono uppercase tracking-widest text-slate-400 hover:text-neon-cyan"
          >
            {fullScreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            {fullScreen ? "Exit full screen" : "Full screen"}
          </button>
          {/* The sliding inspector overlay */}
          <NodeInspector />
          {/* (The old personal-canvas overlay + MY CANVAS toggle is retired —
              the ADR-0028 dock in GlobalCanvasStage replaces it.) */}
        </motion.section>

        {/* Right HUD. It opens on SELECTION as well as on hover and pin: the HUD is the
            evidence the system reasoned rather than guessed, and the moment that matters is
            when someone asks "how did it know that" — which is a click on a card. */}
        {fullScreen && !rightOpen ? (
          <div onMouseEnter={() => setRightHover(true)}>
            <RailStrip label="Live context" side="right" pinned={rightPinned} onToggle={toggleRight} />
          </div>
        ) : (
          <motion.aside
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            onMouseEnter={() => setRightHover(true)}
            onMouseLeave={() => setRightHover(false)}
            className="w-80 border-l border-glass-border flex flex-col overflow-hidden shrink-0 relative"
          >
            {hud}
            {fullScreen && (
              <button
                type="button"
                onClick={toggleRight}
                title={rightPinned ? "Unpin live context" : "Pin live context open"}
                aria-label={rightPinned ? "Unpin live context" : "Pin live context open"}
                className="absolute top-2 left-2 z-10 text-slate-500 hover:text-neon-cyan"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.aside>
        )}
      </div>
    </div>
  );
}
