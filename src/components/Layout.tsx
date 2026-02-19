import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";

interface LayoutProps {
  stream: ReactNode;
  hud: ReactNode;
}

export function Layout({ stream, hud }: LayoutProps) {
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
          Interrogator Interface v1.0
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse-neon" />
          <span className="text-xs font-mono text-neon-green/80">
            MESH ONLINE
          </span>
        </div>
      </motion.header>

      {/* ── Main Grid ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Central Neural Stream */}
        <motion.main
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex-1 flex flex-col min-w-0"
        >
          {stream}
        </motion.main>

        {/* Right HUD Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-80 border-l border-glass-border flex flex-col overflow-hidden"
        >
          {hud}
        </motion.aside>
      </div>
    </div>
  );
}
