import React, { useState, useEffect } from 'react';

interface RadarRevealProps {
  children: React.ReactNode;
  delayMs?: number;
}

export const RadarReveal: React.FC<RadarRevealProps> = ({ children, delayMs = 0 }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Start animation sequence
    const t1 = setTimeout(() => setPhase(1), delayMs);       // Draw line outward
    const t2 = setTimeout(() => setPhase(2), delayMs + 300); // Expand vertical box
    const t3 = setTimeout(() => setPhase(3), delayMs + 600); // Fade in content

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [delayMs]);

  return (
    <div className="w-full flex flex-col items-center justify-center my-2 relative">
      {/* Phase 1: The horizontal radar line */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 h-[2px] bg-neon-blue shadow-[0_0_15px_#00f0ff] transition-all duration-500 ease-out z-10
          ${phase === 1 ? 'w-full opacity-100' : 'w-0 opacity-0'}
          ${phase >= 2 ? 'opacity-0 hidden' : ''}
        `}
      />
      
      {/* Phase 2 & 3: The vertical expansion and content reveal */}
      <div 
        className={`w-full transition-all duration-700 ease-in-out
          ${phase >= 2 ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}
          overflow-hidden
        `}
      >
        <div className={`transition-opacity duration-500 transform ${phase === 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
