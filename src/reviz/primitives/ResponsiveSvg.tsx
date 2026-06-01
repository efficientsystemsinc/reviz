"use client";

import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { useMeasure } from "./hooks";

export interface ChartArea {
  /** Full svg width in px. */
  width: number;
  /** Full svg height in px. */
  height: number;
  /** Inner plotting box after margins. */
  inner: { width: number; height: number };
  margin: { top: number; right: number; bottom: number; left: number };
}

/**
 * A width-measuring, aspect-locked SVG container. Children receive the resolved
 * pixel geometry so charts can build scales. The container is fully responsive;
 * the SVG also carries a viewBox so figure export stays crisp.
 */
export const ResponsiveSvg = forwardRef<
  SVGSVGElement,
  {
    aspect?: number;
    height?: number;
    minHeight?: number;
    margin?: Partial<ChartArea["margin"]>;
    className?: string;
    children: (area: ChartArea) => ReactNode;
  }
>(function ResponsiveSvg(
  { aspect = 16 / 10, height, minHeight = 160, margin: marginProp, className, children },
  forwardedRef,
) {
  const [ref, rect] = useMeasure<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  useImperativeHandle(forwardedRef, () => svgRef.current as SVGSVGElement);

  const width = Math.max(rect.width, 0);
  const h = Math.max(height ?? width / aspect, minHeight);
  const margin = { top: 16, right: 16, bottom: 28, left: 40, ...marginProp };
  const area: ChartArea = {
    width,
    height: h,
    margin,
    inner: {
      width: Math.max(width - margin.left - margin.right, 0),
      height: Math.max(h - margin.top - margin.bottom, 0),
    },
  };

  return (
    <div ref={ref} className={className} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${h}`}
          width={width}
          height={h}
          role="img"
          style={{ display: "block", overflow: "visible" }}
        >
          {children(area)}
        </svg>
      )}
    </div>
  );
});
