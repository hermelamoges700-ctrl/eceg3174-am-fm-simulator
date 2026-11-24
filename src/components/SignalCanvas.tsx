import React, { useEffect, useRef, useState } from 'react';

export interface TraceSeries {
  id: string;
  label: string;
  color: string;
  data: Float64Array | number[];
  lineWidth?: number;
  dashed?: boolean;
  alpha?: number;
  unit?: string;
}

export interface ShadedBand {
  label: string;
  xStart: number;
  xEnd: number;
  fillColor: string;
  borderColor: string;
  textColor: string;
}

export interface SignalCanvasProps {
  xValues: Float64Array | number[];
  traces: TraceSeries[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xUnit: string;
  yUnit: string;
  xTicks?: number;
  yTicks?: number;
  height?: number;
  zeroLine?: boolean;
  shadedBands?: ShadedBand[];
  verticalMarkers?: { x: number; label: string; color: string }[];
  ariaLabel: string;
}

interface HoverReadout {
  x: number;
  px: number;
  py: number;
  values: { label: string; color: string; value: number; unit: string }[];
}

export const SignalCanvas: React.FC<SignalCanvasProps> = ({
  xValues,
  traces,
  xMin,
  xMax,
  yMin,
  yMax,
  xUnit,
  yUnit,
  xTicks = 6,
  yTicks = 4,
  height = 220,
  zeroLine = true,
  shadedBands = [],
  verticalMarkers = [],
  ariaLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState<number>(640);
  const [hover, setHover] = useState<HoverReadout | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setWidth(Math.floor(rect.width));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padLeft = 48;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 28;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);
    const xSpan = Math.max(1e-9, xMax - xMin);
    const ySpan = Math.max(1e-9, yMax - yMin);

    const mapX = (x: number) => padLeft + ((x - xMin) / xSpan) * plotW;
    const mapY = (y: number) => padTop + ((yMax - y) / ySpan) * plotH;

    // Clean clinical plot background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(padLeft, padTop, plotW, plotH);

    // Clip region for shaded bands and traces
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    // Shaded bandwidth overlays (e.g. Carson Bandwidth)
    for (const band of shadedBands) {
      const x1 = Math.max(padLeft, mapX(band.xStart));
      const x2 = Math.min(padLeft + plotW, mapX(band.xEnd));
      if (x2 > x1) {
        ctx.fillStyle = band.fillColor;
        ctx.fillRect(x1, padTop, x2 - x1, plotH);

        ctx.strokeStyle = band.borderColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, padTop);
        ctx.lineTo(x1, padTop + plotH);
        ctx.moveTo(x2, padTop);
        ctx.lineTo(x2, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label at top of shaded band
        ctx.fillStyle = band.textColor;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(band.label, (x1 + x2) / 2, padTop + 12);
      }
    }

    // Horizontal grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= yTicks; i++) {
      const yVal = yMin + (i / yTicks) * ySpan;
      const py = Math.round(mapY(yVal)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= xTicks; i++) {
      const xVal = xMin + (i / xTicks) * xSpan;
      const px = Math.round(mapX(xVal)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();
    }

    // Zero reference line
    if (zeroLine && yMin < 0 && yMax > 0) {
      const zy = Math.round(mapY(0)) + 0.5;
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, zy);
      ctx.lineTo(padLeft + plotW, zy);
      ctx.stroke();
    }

    // Vertical marker lines (e.g., fc or fm harmonics)
    for (const marker of verticalMarkers) {
      if (marker.x >= xMin && marker.x <= xMax) {
        const mx = Math.round(mapX(marker.x)) + 0.5;
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(mx, padTop);
        ctx.lineTo(mx, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Find start/end index bounds for xMin..xMax
    let startIdx = 0;
    let endIdx = xValues.length - 1;
    while (startIdx < xValues.length - 1 && xValues[startIdx + 1] < xMin) startIdx++;
    while (endIdx > startIdx && xValues[endIdx - 1] > xMax) endIdx--;

    // Plot traces
    for (const trace of traces) {
      if (endIdx <= startIdx) continue;
      ctx.save();
      ctx.strokeStyle = trace.color;
      ctx.lineWidth = trace.lineWidth ?? 1.65;
      ctx.globalAlpha = trace.alpha ?? 1;
      if (trace.dashed) {
        ctx.setLineDash([5, 4]);
      }

      ctx.beginPath();
      const totalPts = endIdx - startIdx + 1;
      // Downsample only when dense (> 2.5 points per pixel) using min-max envelope decimation
      // so high-frequency carriers never alias visually!
      const maxDirectPts = plotW * 2.5;
      if (totalPts <= maxDirectPts) {
        for (let i = startIdx; i <= endIdx; i++) {
          const px = mapX(xValues[i]);
          const py = mapY(trace.data[i]);
          if (i === startIdx) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      } else {
        const buckets = Math.max(10, Math.floor(plotW));
        const step = totalPts / buckets;
        let started = false;
        for (let b = 0; b < buckets; b++) {
          const bStart = startIdx + Math.floor(b * step);
          const bEnd = Math.min(endIdx, startIdx + Math.floor((b + 1) * step));
          let minV = Infinity;
          let maxV = -Infinity;
          let minI = bStart;
          let maxI = bStart;
          for (let i = bStart; i <= bEnd; i++) {
            const v = trace.data[i];
            if (v < minV) {
              minV = v;
              minI = i;
            }
            if (v > maxV) {
              maxV = v;
              maxI = i;
            }
          }
          const firstI = minI <= maxI ? minI : maxI;
          const secondI = minI <= maxI ? maxI : minI;
          const px1 = mapX(xValues[firstI]);
          const py1 = mapY(trace.data[firstI]);
          const px2 = mapX(xValues[secondI]);
          const py2 = mapY(trace.data[secondI]);
          if (!started) {
            ctx.moveTo(px1, py1);
            started = true;
          } else {
            ctx.lineTo(px1, py1);
          }
          if (secondI !== firstI) {
            ctx.lineTo(px2, py2);
          }
        }
      }

      ctx.stroke();
      ctx.restore();
    }

    // Hover crosshair inside plot area
    if (hover && hover.px >= padLeft && hover.px <= padLeft + plotW) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hover.px, padTop);
      ctx.lineTo(hover.px, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // remove clip

    // Outer plot box border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft + 0.5, padTop + 0.5, plotW, plotH);

    // Y-axis tick labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yTicks; i++) {
      const yVal = yMin + (i / yTicks) * ySpan;
      const py = mapY(yVal);
      const formatted = Math.abs(yVal) < 1e-6 ? '0' : Number.isInteger(yVal) ? String(yVal) : yVal.toFixed(1);
      ctx.fillText(formatted, padLeft - 6, py);
    }

    // Y-axis unit tag
    ctx.fillStyle = '#64748b';
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(yUnit, 6, padTop);

    // X-axis tick labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= xTicks; i++) {
      const xVal = xMin + (i / xTicks) * xSpan;
      const px = mapX(xVal);
      const formatted = xSpan >= 10 ? xVal.toFixed(0) : xVal.toFixed(2);
      ctx.fillText(i === xTicks ? `${formatted} ${xUnit}` : formatted, px, padTop + plotH + 6);
    }

    ctx.restore();
  }, [
    width,
    height,
    xValues,
    traces,
    xMin,
    xMax,
    yMin,
    yMax,
    xUnit,
    yUnit,
    xTicks,
    yTicks,
    zeroLine,
    shadedBands,
    verticalMarkers,
    hover,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || xValues.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const plotW = Math.max(10, width - padLeft - padRight);
    const plotH = Math.max(10, height - padTop - padBottom);

    if (px < padLeft || px > padLeft + plotW || py < padTop || py > padTop + plotH) {
      setHover(null);
      return;
    }

    const targetX = xMin + ((px - padLeft) / plotW) * (xMax - xMin);
    // Binary search nearest index in sorted xValues
    let lo = 0;
    let hi = xValues.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xValues[mid] < targetX) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(xValues[lo - 1] - targetX) < Math.abs(xValues[lo] - targetX)) {
      lo -= 1;
    }

    const snappedX = xValues[lo];
    const snappedPx = padLeft + ((snappedX - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;

    setHover({
      x: snappedX,
      px: snappedPx,
      py,
      values: traces.map((t) => ({
        label: t.label,
        color: t.color,
        value: t.data[lo] ?? 0,
        unit: t.unit ?? yUnit,
      })),
    });
  };

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
        className="block cursor-crosshair rounded"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        aria-label={ariaLabel}
      />
      {hover && (
        <div
          className="pointer-events-none absolute top-3 right-4 z-10 rounded border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-mono tabular-nums shadow-sm"
        >
          <div className="text-slate-500 mb-0.5">
            {xUnit === 'kHz' ? 'f' : 't'} = {hover.x.toFixed(xUnit === 'kHz' ? 1 : 3)} {xUnit}
          </div>
          <div className="flex flex-col gap-0.5">
            {hover.values.map((v) => (
              <div key={v.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span
                    className="inline-block h-1.5 w-3 rounded-[1px]"
                    style={{ backgroundColor: v.color }}
                  />
                  {v.label}
                </span>
                <span className="font-semibold text-slate-900">
                  {v.value.toFixed(2)} {v.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
