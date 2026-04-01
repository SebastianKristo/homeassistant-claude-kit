import { useRef, useEffect } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import {
  type ResolvedTheme,
  resolveTheme,
  themeChanged,
} from "../../lib/chart-plugins";

interface UPlotChartProps {
  buildOpts: (
    theme: ResolvedTheme,
    width: number,
    height: number,
  ) => uPlot.Options;
  data: uPlot.AlignedData;
  height?: number;
  className?: string;
}

export function UPlotChart({
  buildOpts,
  data,
  height = 160,
  className,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const themeRef = useRef<ResolvedTheme | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = resolveTheme();
    themeRef.current = theme;

    const w = el.clientWidth;
    const opts = buildOpts(theme, w, height);
    const chart = new uPlot(opts, dataRef.current, el);
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const newW = Math.round(entry.contentRect.width);
      if (newW > 0 && chartRef.current) {
        chartRef.current.setSize({ width: newW, height });
      }
    });
    ro.observe(el);

    const mo = new MutationObserver(() => {
      const newTheme = resolveTheme();
      if (themeRef.current && themeChanged(themeRef.current, newTheme)) {
        themeRef.current = newTheme;
        chartRef.current?.destroy();
        const newW = el.clientWidth;
        const newOpts = buildOpts(newTheme, newW, height);
        chartRef.current = new uPlot(newOpts, dataRef.current, el);
      }
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => {
      ro.disconnect();
      mo.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, buildOpts]);

  useEffect(() => {
    if (chartRef.current && data) {
      chartRef.current.setData(data);
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height }}
    />
  );
}
