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
      /* TOP-ALIGNED, NOT CENTERED. Centering made the vertical position of a card's content a
         function of how tall that content happened to be: a short answer (a single metric, a
         short ranking) floated mid-card with empty bands above and below, while a tall one sat
         flush at the top. Side by side those read as two different layouts rather than one.
         Horizontal centering stays — the scale is chosen by width, so content usually fills it
         anyway, and when it does not, centered is right for a single column. */
      className={`w-full h-full overflow-hidden flex items-start justify-center ${className ?? ""}`}
    >
      <div
        ref={innerRef}
        style={{
          width: naturalWidth,
          flex: "0 0 auto",
          transform: `scale(${scale})`,
          // MUST MATCH `items-start` ABOVE. `center center` scales toward the middle, which
          // reintroduces the gap the alignment just removed — the element's box shrinks from
          // its centre and leaves half the removed height above it.
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
