"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseResizableOptions {
  initial: number;
  min: number;
  max: number;
  direction: "left" | "right"; // which edge the handle is on
}

export function useResizable({ initial, min, max, direction }: UseResizableOptions) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = direction === "right"
        ? startWidth.current + delta
        : startWidth.current - delta;
      setWidth(Math.min(max, Math.max(min, newWidth)));
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [min, max, direction]);

  return { width, onMouseDown };
}
