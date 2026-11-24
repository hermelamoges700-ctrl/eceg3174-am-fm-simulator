import React from 'react';
import { FM_THRESHOLD_DB, SimResult } from '../dsp/simulator';

interface MetricsBarProps {
  result: SimResult;
}

function formatDb(val: number): string {
  if (val >= 79.5) return '> 80.0';
  return val.toFixed(1);
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ result }) => {
  const thresholdMeta =
    result.thresholdStatus === 'above'
      ? {
          glyph: '●',
          label: 'Above FM Threshold',
          detail: `+${result.thresholdMarginDb.toFixed(1)} dB margin above 10 dB`,
          cls: 'text-emerald-700',
          bgCls: 'bg-emerald-50/70 border-emerald-200',
        }
      : result.thresholdStatus === 'near'
      ? {
          glyph: '▲',
          label: 'Near FM Threshold (~10 dB)',
          detail: `${result.thresholdMarginDb >= 0 ? '+' : ''}${result.thresholdMarginDb.toFixed(1)} dB vs 10 dB knee`,
          cls: 'text-amber-700',
          bgCls: 'bg-amber-50/70 border-amber-200',
        }
      : {
          glyph: '✖',
          label: 'Below FM Threshold',
          detail: `${result.thresholdMarginDb.toFixed(1)} dB below 10 dB (clicks)`,
          cls: 'text-rose-700',
          bgCls: 'bg-rose-50/70 border-rose-200',
        };

  return (
    <section
      id="metrics"
      aria-label="Numerical Signal Performance Readouts"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {/* Card 1: Input CNR / SNR */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500">
          Pre-Detection Input CNR / SNR
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 font-mono tabular-nums">
          <div>
            <span className="text-xs text-slate-500">FM CNR </span>
            <span className="text-xl font-semibold text-blue-700">
              {formatDb(result.fmInputCnrDb)}
            </span>
            <span className="ml-1 text-xs text-slate-400">dB</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">AM SNR </span>
            <span className="text-lg font-semibold text-amber-700">
              {formatDb(result.amInputSnrDb)}
            </span>
            <span className="ml-1 text-xs text-slate-400">dB</span>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-500">
          <span>AM Carrier CNR: {formatDb(result.amInputCnrDb)} dB</span>
        </div>
      </div>

      {/* Card 2: Output SNR */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500">
          Demodulated Output SNR
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 font-mono tabular-nums">
          <div>
            <span className="text-xs text-slate-500">FM </span>
            <span className="text-xl font-semibold text-blue-700">
              {formatDb(result.fmOutputSnrDb)}
            </span>
            <span className="ml-1 text-xs text-slate-400">dB</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">AM </span>
            <span className="text-lg font-semibold text-amber-700">
              {formatDb(result.amOutputSnrDb)}
            </span>
            <span className="ml-1 text-xs text-slate-400">dB</span>
          </div>
        </div>
        <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-600">
          FM vs. AM Advantage:{' '}
          <span
            className={
              result.fmGainOverAmDb >= 0
                ? 'font-semibold text-emerald-700'
                : 'font-semibold text-rose-700'
            }
          >
            {result.fmGainOverAmDb >= 0 ? '+' : ''}
            {result.fmGainOverAmDb.toFixed(1)} dB
          </span>
        </div>
      </div>

      {/* Card 3: Total Harmonic Distortion */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500">
          Total Harmonic Distortion (THD)
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 font-mono tabular-nums">
          <div>
            <span className="text-xs text-slate-500">AM </span>
            <span
              className={`text-xl font-semibold ${
                result.amThdPct > 5 ? 'text-rose-700' : 'text-amber-700'
              }`}
            >
              {result.amThdPct.toFixed(1)}
            </span>
            <span className="ml-0.5 text-xs text-slate-400">%</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500">FM </span>
            <span
              className={`text-lg font-semibold ${
                result.fmThdPct > 5 ? 'text-rose-700' : 'text-blue-700'
              }`}
            >
              {result.fmThdPct.toFixed(1)}
            </span>
            <span className="ml-0.5 text-xs text-slate-400">%</span>
          </div>
        </div>
        <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-500">
          β = {result.beta.toFixed(2)} · B<sub>T</sub> ={' '}
          {result.carsonBwKHz.toFixed(1)} kHz
        </div>
      </div>

      {/* Card 4: FM Threshold Status */}
      <div className={`rounded-lg border p-4 ${thresholdMeta.bgCls}`}>
        <div className="text-xs font-medium text-slate-600">
          FM Threshold Monitor ({FM_THRESHOLD_DB.toFixed(0)} dB CNR)
        </div>
        <div className={`mt-2 text-sm font-semibold ${thresholdMeta.cls}`}>
          <span aria-hidden="true" className="mr-1.5">
            {thresholdMeta.glyph}
          </span>
          {thresholdMeta.label}
        </div>
        <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-700">
          {thresholdMeta.detail}
        </div>
      </div>
    </section>
  );
};
