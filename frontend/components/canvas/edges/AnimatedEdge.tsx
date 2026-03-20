"use client";

import { BaseEdge, getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

interface AnimatedEdgeData {
  animated: boolean;
  pathType: "search" | "ai" | "build" | "bridge";
  color: string;
  routeType?: "bezier" | "smoothstep";
}

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: EdgeProps) {
  const edgeData = (data || {}) as unknown as AnimatedEdgeData;
  const routeType = edgeData.routeType || "bezier";
  const isAnimated = edgeData.animated;
  const color = edgeData.color || "var(--edge-color)";
  const isBridge = edgeData.pathType === "bridge";

  const pathParams = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [edgePath] =
    routeType === "smoothstep" ? getSmoothStepPath(pathParams) : getBezierPath(pathParams);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isAnimated ? color : (style?.stroke as string),
          strokeWidth: isAnimated ? (isBridge ? 0.8 : 1.5) : ((style?.strokeWidth as number) || 1),
        }}
      />
      {isAnimated &&
        [0, 0.5, 1].map((begin) => (
          <circle
            key={begin}
            r={isBridge ? 2 : 3}
            fill={color}
            opacity={isBridge ? 0.5 : 0.8}
          >
            <animateMotion
              dur={isBridge ? "2s" : "1.5s"}
              repeatCount="indefinite"
              begin={`${begin}s`}
              path={edgePath}
            />
          </circle>
        ))}
    </>
  );
}
