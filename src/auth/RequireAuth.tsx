import React from "react";
import { useAuth } from "react-oidc-context";
import { LogIn, ShieldAlert } from "lucide-react";
import { config } from "@/config";

/**
 * RequireAuth guard component.
 * Ensures the user is authenticated before rendering children.
 * Features a Dark Glass & Neon themed login screen.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const disableAuth = config.VITE_NO_AUTH === "true";

  if (disableAuth) {
    return <>{children}</>;
  }

  if (auth.isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#020617] font-mono">
        <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="h-1 w-48 bg-neon-blue/20 overflow-hidden relative">
                <div className="absolute inset-0 bg-neon-blue animate-[scan_2s_ease-in-out_infinite]" />
            </div>
            <div className="text-neon-blue text-xs tracking-widest uppercase">
                Authenticating Session...
            </div>
        </div>
      </div>
    );
  }

  if (auth.error) {
     return (
      <div className="h-screen flex items-center justify-center bg-[#020617] font-mono p-4">
        <div className="glass-panel max-w-md w-full p-8 border-neon-pink/50 flex flex-col items-center text-center">
          <ShieldAlert className="text-neon-pink w-16 h-16 mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Authentication Error</h1>
          <p className="text-slate-400 mb-6 text-sm">{auth.error.message}</p>
          <button
            onClick={() => auth.signinRedirect()}
            className="w-full px-6 py-3 bg-neon-pink/10 border border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20 transition-all uppercase tracking-widest text-xs font-bold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#020617] font-mono p-4 relative overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-neon-blue/5 rounded-full blur-[120px]" />
        
        <div className="glass-panel max-w-md w-full p-10 border-neon-blue/30 relative z-10">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center mb-6">
                 <LogIn className="text-neon-blue w-8 h-8" />
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tighter">THE CORTEX</h1>
            <p className="text-neon-blue text-[10px] tracking-[0.3em] uppercase mb-8 opacity-70">
                Agent Mesh Interrogator
            </p>

            <p className="text-slate-400 mb-10 text-sm leading-relaxed">
              Restricted Access. Please authenticate via SSO to establish a persistent neural link with the agentic mesh.
            </p>

            <button
              onClick={() => auth.signinRedirect()}
              className="group relative w-full px-8 py-4 bg-neon-blue/10 border border-neon-blue/50 text-neon-blue hover:bg-neon-blue/20 transition-all overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-neon-cyan to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs font-bold">
                <span>Synchronize Identity</span>
              </div>
            </button>
            
            <div className="mt-8 pt-8 border-t border-white/5 w-full text-[10px] text-slate-600 uppercase tracking-widest">
                Terminal ID: {window.location.hostname}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
