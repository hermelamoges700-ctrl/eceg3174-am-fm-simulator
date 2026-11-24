import React from 'react';
import {
  FILTER_DESCRIPTIONS,
  FilterSetting,
  SimParams,
  SimResult,
} from '../dsp/simulator';

interface ControlDeckProps {
  params: SimParams;
  result: SimResult;
  onChange: (patch: Partial<SimParams>) => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  params,
  result,
  onChange,
}) => {
  const amRegime =
    params.muA > 1.001
      ? { text: '▲ Over-Modulated (μₐ > 1)', cls: 'text-rose-700' }
      : Math.abs(params.muA - 1.0) <= 0.001
      ? { text: '● Critical 100% (μₐ = 1)', cls: 'text-amber-700' }
      : { text: '● Under-Modulated (μₐ < 1)', cls: 'text-emerald-700' };

  const fmRegime =
    result.beta < 0.5
      ? 'Narrowband FM (β < 0.5)'
      : result.beta < 1.0
      ? 'Transition FM (0.5 ≤ β < 1)'
      : 'Wideband FM (β ≥ 1)';

  return (
    <aside
      aria-label="Simulation Parameters"
      className="flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5"
    >
      {/* Section 1: Message & Carrier */}
      <section className="flex flex-col gap-4 border-b border-slate-100 pb-4">
        <h2 className="text-sm font-semibold text-slate-900">
          01. Baseband & Carrier Conditions
        </h2>

        {/* Message frequency fm */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-fm"
              className="text-xs font-medium text-slate-700"
            >
              Message Frequency (f<sub>m</sub>)
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {params.fmKHz.toFixed(1)}{' '}
              <span className="text-[11px] font-normal text-slate-500">kHz</span>
            </span>
          </div>
          <input
            id="slider-fm"
            type="range"
            min={3.0}
            max={5.0}
            step={0.1}
            value={params.fmKHz}
            onChange={(e) => onChange({ fmKHz: parseFloat(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>3.0 kHz</span>
            <span>4.0 kHz</span>
            <span>5.0 kHz</span>
          </div>
        </div>

        {/* Received carrier amplitude Ac */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-ac"
              className="text-xs font-medium text-slate-700"
            >
              Received Carrier Amplitude (A<sub>c</sub>)
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {params.ac.toFixed(2)}{' '}
              <span className="text-[11px] font-normal text-slate-500">V</span>
            </span>
          </div>
          <input
            id="slider-ac"
            type="range"
            min={0.2}
            max={2.0}
            step={0.05}
            value={params.ac}
            onChange={(e) => onChange({ ac: parseFloat(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>0.20 V</span>
            <span>1.10 V</span>
            <span>2.00 V</span>
          </div>
        </div>
      </section>

      {/* Section 2: AM Modulation */}
      <section className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            02. AM Envelope Modulation
          </h2>
          <span className="font-mono text-[11px] font-medium text-amber-700">
            BW = {result.amBwKHz.toFixed(1)} kHz
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-mua"
              className="text-xs font-medium text-slate-700"
            >
              Modulation Index (μ<sub>a</sub>)
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {params.muA.toFixed(2)}
            </span>
          </div>
          <input
            id="slider-mua"
            type="range"
            min={0.1}
            max={2.0}
            step={0.05}
            value={params.muA}
            onChange={(e) => onChange({ muA: parseFloat(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>0.10</span>
            <span className="font-semibold text-slate-600">1.00</span>
            <span>2.00</span>
          </div>
        </div>

        <div className={`text-xs font-medium ${amRegime.cls}`}>
          {amRegime.text}
        </div>
      </section>

      {/* Section 3: FM Modulation */}
      <section className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            03. FM Frequency Modulation
          </h2>
          <span className="font-mono text-[11px] font-medium text-blue-700">
            Carson = {result.carsonBwKHz.toFixed(1)} kHz
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-deltaf"
              className="text-xs font-medium text-slate-700"
            >
              Peak Frequency Deviation (Δf)
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {params.deltaFKHz.toFixed(1)}{' '}
              <span className="text-[11px] font-normal text-slate-500">kHz</span>
            </span>
          </div>
          <input
            id="slider-deltaf"
            type="range"
            min={1.0}
            max={25.0}
            step={0.5}
            value={params.deltaFKHz}
            onChange={(e) =>
              onChange({ deltaFKHz: parseFloat(e.target.value) })
            }
            className="lab-slider w-full"
          />
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>1.0 kHz</span>
            <span>13.0 kHz</span>
            <span>25.0 kHz</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-2.5 border border-slate-200/80">
          <div>
            <div className="text-[11px] text-slate-500">FM Index (β = Δf/fₘ)</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {result.beta.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Carson BW 2(Δf+fₘ)</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {result.carsonBwKHz.toFixed(1)} kHz
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-600">{fmRegime}</div>
      </section>

      {/* Section 4: Channel Noise & Receiver Filter */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-900">
          04. Channel Noise & Receiver Filter
        </h2>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor="slider-sigma"
              className="text-xs font-medium text-slate-700"
            >
              Channel Noise Level (σ<sub>n</sub>)
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {params.sigmaN.toFixed(2)}{' '}
              <span className="text-[11px] font-normal text-slate-500">Vrms</span>
            </span>
          </div>
          <input
            id="slider-sigma"
            type="range"
            min={0.0}
            max={1.5}
            step={0.01}
            value={params.sigmaN}
            onChange={(e) => onChange({ sigmaN: parseFloat(e.target.value) })}
            className="lab-slider w-full"
          />
          <div className="flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>0.00 V</span>
            <span>0.75 V</span>
            <span>1.50 V</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-700">
            Receiver IF & Audio Filter Setting
          </span>
          <div
            role="radiogroup"
            aria-label="Receiver filter setting"
            className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-100 p-1"
          >
            {(Object.keys(FILTER_DESCRIPTIONS) as FilterSetting[]).map((key) => {
              const active = params.filterSetting === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ filterSetting: key })}
                  className={`min-h-[38px] rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {FILTER_DESCRIPTIONS[key].label}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] leading-relaxed text-slate-500">
            {FILTER_DESCRIPTIONS[params.filterSetting].summary}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums text-slate-600">
            <span>AM IF: {result.amIfBwKHz.toFixed(1)} kHz</span>
            <span aria-hidden="true">·</span>
            <span>FM IF: {result.fmIfBwKHz.toFixed(1)} kHz</span>
            <span aria-hidden="true">·</span>
            <span>FM AF: {result.fmAfCutoffKHz.toFixed(1)} kHz</span>
          </div>
        </div>
      </section>
    </aside>
  );
};
