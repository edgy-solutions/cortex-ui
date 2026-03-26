import { useAuth } from "react-oidc-context";
import { LogOut, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

/**
 * UserMenu component for the Header.
 * Displays the authenticated user's name and a logout option.
 */
export function UserMenu() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const disableAuth = import.meta.env.VITE_NO_AUTH === "true";

  if (disableAuth) {
    return (
      <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5">
        <div className="w-8 h-8 rounded-full bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-neon-blue" />
        </div>
        <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">Operator</span>
            <span className="text-xs font-mono text-white tracking-wide">MOCK_USER_01</span>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) return null;

  const username = auth.user?.profile.preferred_username || auth.user?.profile.email || "Unknown User";

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center">
             <UserIcon className="w-4 h-4 text-neon-blue" />
        </div>
        <div className="flex flex-col text-left">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">Authenticated</span>
            <span className="text-xs font-mono text-white tracking-wide truncate max-w-[120px]">
                {username}
            </span>
        </div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for closing */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-48 z-50 glass-panel border-neon-blue/30 p-2 shadow-2xl"
            >
              <button
                onClick={() => auth.signoutRedirect()}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-mono text-slate-400 hover:text-neon-pink hover:bg-neon-pink/10 transition-colors rounded-md group"
              >
                <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                <span className="uppercase tracking-widest font-bold text-[10px]">Terminate Session</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
