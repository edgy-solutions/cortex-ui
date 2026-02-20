import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Send, Zap, Wifi, WifiOff } from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { useInterviewStore } from "@/store/useInterviewStore";

export function InputBar() {
  const [value, setValue] = useState("");
  const { sendMessage, isConnected } = useAgent();
  const phase = useInterviewStore((s) => s.phase);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || phase !== "active") return;
    sendMessage(value.trim());
    setValue("");
  };

  const isDisabled = phase !== "active";

  return (
    <div className="px-6 pb-5 pt-2">
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="relative"
      >
        {/* Outer glow ring */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-blue/20 via-neon-purple/20 to-neon-blue/20 rounded-2xl blur-sm" />

        <div className="relative glass-panel flex items-center gap-3 p-2 pl-4">
          {/* Connection status indicator */}
          {isConnected ? (
            <Wifi className="w-4 h-4 text-neon-green/70 flex-shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}
          <Zap className="w-4 h-4 text-neon-blue/50 flex-shrink-0" />

          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isDisabled}
            placeholder={
              isDisabled
                ? "Interview complete — compile the workflow"
                : isConnected
                  ? "Connected to mesh — begin interrogation..."
                  : "Offline mode — begin interrogation..."
            }
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 font-mono outline-none disabled:opacity-40"
          />

          <button
            type="submit"
            disabled={!value.trim() || isDisabled}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue hover:bg-neon-blue/20 hover:neon-glow-blue transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </motion.form>
    </div>
  );
}
