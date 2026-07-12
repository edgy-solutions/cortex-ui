import { useLayoutEffect, useRef, useState } from "react";

/**
 * FitBox — renders its children at a fixed NATURAL width, measures the natural
 * (unscaled) size, and CSS-scales the whole block down so it fits entirely
 * inside the box. Nothing is clipped — the full content is shown, shrunk to fit.
 *
 * Used by the stage cards so a chart / table / document is wholly visible at
 * card scale (the point of the canvas) rather than clipped. Transforms are
 * post-layout, so scrollHeight measures the true natural height regardless of
 * the applied scale (no measurement feedback loop). Never upscales past 1.
 */
export function FitBox({
  naturalWidth,
  className,
  children,
}: {
  naturalWidth: number;
  className?: string;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const measure = () => {
      const o = outerRef.current;
      const i = innerRef.current;
      if (!o || !i) return;
      const bw = o.clientWidth;
      const bh = o.clientHeight;
      const ih = i.scrollHeight || i.offsetHeight;
      if (!bw || !bh || !ih) return;
      setScale(Math.min(bw / naturalWidth, bh / ih, 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [naturalWidth]);

  return (
    <div
      ref={outerRef}
      className={`w-full h-full overflow-hidden flex items-center justify-center ${className ?? ""}`}
    >
      <div
        ref={innerRef}
        style={{
          width: naturalWidth,
          flex: "0 0 auto",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
