import { useLayoutEffect, useRef, useState } from "react";

/**
 * FitBox — renders its children at a fixed NATURAL width, measures the natural
 * (unscaled) height, and CSS-scales the block so it fills the box's WIDTH.
 * Content taller than the box is cut at the box's bottom edge and SCROLLS.
 *
 * WIDTH ONLY, NEVER HEIGHT (Chris, 10-29). This used to scale by the smaller of the width and
 * height ratios, so nothing was ever clipped. That held for short answers and failed for tall
 * ones: a 402-part review card shrank to a sliver in the middle of its card, smaller the taller
 * it got, and unreadable at any zoom. A card is now always as wide as its content's natural
 * width allows; height is what scrolls.
 *
 * Transforms are post-layout, so scrollHeight measures the true natural height regardless of
 * the applied scale (no measurement feedback loop). A transformed block keeps its UNSCALED box
 * in layout, so the block is taken out of flow and laid over a sizer that has the SCALED size:
 * the scroll extent is then set by layout, not by how an engine counts a transformed child's
 * overflow (Chromium counts the scaled box; probed 10-29).
 * Never upscales past 1.
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
  const [naturalHeight, setNaturalHeight] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const o = outerRef.current;
      const i = innerRef.current;
      if (!o || !i) return;
      const bw = o.clientWidth;
      const ih = i.scrollHeight || i.offsetHeight;
      if (!bw) return;
      setScale(Math.min(bw / naturalWidth, 1));
      setNaturalHeight(ih);
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
      data-fitbox
      data-fitbox-scale={scale}
      /* TOP-ALIGNED, NOT CENTERED. Centering made the vertical position of a card's content a
         function of how tall that content happened to be: a short answer (a single metric, a
         short ranking) floated mid-card with empty bands above and below, while a tall one sat
         flush at the top. Side by side those read as two different layouts rather than one.
         `overscroll-contain` keeps a card's scroll from chaining to the stage behind it. The
         gutter is STABLE so a scrollbar appearing cannot narrow the width the scale is read
         from, which would shorten the block, drop the scrollbar, and loop. */
      className={`w-full h-full overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar ${className ?? ""}`}
      style={{ scrollbarGutter: "stable" }}
    >
      <div
        data-fitbox-sizer
        className="relative mx-auto"
        style={{ width: naturalWidth * scale, height: naturalHeight ? naturalHeight * scale : undefined }}
      >
        <div
          ref={innerRef}
          style={{
            width: naturalWidth,
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${scale})`,
            // MUST BE THE TOP-LEFT CORNER: the sizer is exactly the scaled box, so the block
            // shrinks into it from that corner. `center` would shrink it away from the sizer's
            // top and left edges and leave half the removed size as a gap.
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
