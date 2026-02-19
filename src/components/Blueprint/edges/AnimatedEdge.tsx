import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

/**
 * A custom React Flow edge that renders a pulsing gradient "data flow"
 * particle traveling along the path. Uses two SVG layers:
 * 1) A dim base stroke for the wire itself
 * 2) An animated dash overlay that simulates a moving particle/pulse
 */
export const AnimatedEdge = memo(function AnimatedEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 24,
  });

  const gradientId = `edge-gradient-${id}`;
  const filterId = `edge-glow-${id}`;

  return (
    <>
      {/* SVG defs for this edge */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.1" />
          <stop offset="40%" stopColor="#00d4ff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#a855f7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
        </linearGradient>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base dim wire */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "rgba(0, 212, 255, 0.12)",
          strokeWidth: 2,
        }}
      />

      {/* Pulsing particle overlay */}
      <path
        d={edgePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2.5}
        strokeDasharray="12 28"
        filter={`url(#${filterId})`}
        style={{
          animation: "dash-flow 2s linear infinite",
        }}
      />

      {/* Secondary subtle glow trail */}
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(0, 212, 255, 0.08)"
        strokeWidth={8}
        strokeLinecap="round"
      />
    </>
  );
});
