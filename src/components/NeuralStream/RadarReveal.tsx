import React, { useState, useEffect } from 'react';

export const RadarReveal = ({ children, delayMs = 0 }: { children: React.ReactNode; delayMs?: number }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 100 + delayMs); // Phase 1: Draw horizontal line
    const t2 = setTimeout(() => setPhase(2), 600 + delayMs); // Phase 2: Expand vertically
    const t3 = setTimeout(() => setPhase(3), 1100 + delayMs); // Phase 3: Fade content in

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [delayMs]); // Only re-run if delayMs changes (or component remounts)

  return (
    <div className="relative w-full flex flex-col items-center justify-center my-4">
      {/* Phase 1: The glowing radar line */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 h-[2px] bg-[#00f0ff] shadow-[0_0_15px_#00f0ff] transition-transform duration-500 ease-out z-10 origin-center
          ${phase >= 1 ? 'scale-x-100' : 'scale-x-0'}
          ${phase >= 2 ? 'opacity-0 transition-opacity duration-300' : 'opacity-100'}
        `}
        style={{ width: '100%' }}
      />
      
      {/* Phase 2 & 3: Vertical Expansion and Content Fade */}
      <div 
        className={`w-full transition-[grid-template-rows] duration-700 ease-in-out grid
          ${phase >= 2 ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}
        `}
      >
        <div className="overflow-hidden">
          <div className={`transition-all duration-500 transform
            ${phase === 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
