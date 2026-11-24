import React, { useMemo, useState } from 'react';
import { RefreshCw, RotateCcw } from 'lucide-react';
import {
  ConditionPreset,
  PRESET_CONFIGS,
  runSimulation,
  SimParams,
} from './dsp/simulator';
import { ControlDeck } from './components/ControlDeck';
import { MetricsBar } from './components/MetricsBar';
import { ShadedBand, SignalCanvas, TraceSeries } from './components/SignalCanvas';
import { TheoryNotes } from './components/TheoryNotes';

const DEFAULT_PARAMS: SimParams = {
  fmKHz: 4.0,
  muA: 0.8,
  deltaFKHz: 12.0,
  ac: PRESET_CONFIGS.clean.ac,
  sigmaN: PRESET_CONFIGS.clean.sigmaN,
  filterSetting: 'matched',
  noiseSeed: 3174,
};

type TimeWindowMs = 0.5 | 1.0 | 2.0;
type ModulatedViewMode = 'transmitted' | 'received';
type SpectrumDomain = 'rf' | 'baseband';
type SpectrumScale = 'db' | 'linear';

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [timeWindowMs, setTimeWindowMs] = useState<TimeWindowMs>(1.0);
  const [modView, setModView] = useState<ModulatedViewMode>('transmitted');
  const [showMessageRef, setShowMessageRef] = useState<boolean>(true);
  const [showAmRecovered, setShowAmRecovered] = useState<boolean>(true);
  const [showFmRecovered, setShowFmRecovered] = useState<boolean>(true);
  const [spectrumDomain, setSpectrumDomain] = useState<SpectrumDomain>('rf');
  const [spectrumScale, setSpectrumScale] = useState<SpectrumScale>('db');

  const result = useMemo(() => runSimulation(params), [params]);

  const activePreset: ConditionPreset = useMemo(() => {
    for (const key of ['clean', 'moderate', 'weak'] as const) {
      const cfg = PRESET_CONFIGS[key];
      if (
        Math.abs(params.ac - cfg.ac) < 0.005 &&
        Math.abs(params.sigmaN - cfg.sigmaN) < 0.005
      ) {
        return key;
      }
    }
    return 'custom';
  }, [params.ac, params.sigmaN]);

  const handlePatch = (patch: Partial<SimParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
  };

  const applyPreset = (preset: Exclude<ConditionPreset, 'custom'>) => {
    const cfg = PRESET_CONFIGS[preset];
    setParams((prev) => ({
      ...prev,
      ac: cfg.ac,
      sigmaN: cfg.sigmaN,
    }));
  };

  const handleResampleNoise = () => {
    setParams((prev) => ({
      ...prev,
      noiseSeed: ((prev.noiseSeed * 1664525 + 1013904223) >>> 0) % 1_000_000,
    }));
  };

  const handleReset = () => {
    setParams(DEFAULT_PARAMS);
    setTimeWindowMs(1.0);
    setModView('transmitted');
    setShowMessageRef(true);
    setShowAmRecovered(true);
    setShowFmRecovered(true);
    setSpectrumDomain('rf');
    setSpectrumScale('db');
  };

  // Compute clean y-bounds for Recovered Waveforms within visible window
  const recoveredYBound = useMemo(() => {
    const maxSamples = Math.min(
      result.numSamples,
      Math.ceil((timeWindowMs / 1000) * result.sampleRateHz)
    );
    let peak = 1.35;
    for (let i = 0; i < maxSamples; i++) {
      if (showAmRecovered) {
        const a = Math.abs(result.amRecovered[i]);
        if (a > peak) peak = a;
      }
      if (showFmRecovered) {
        const f = Math.abs(result.fmRecovered[i]);
        if (f > peak) peak = f;
      }
    }
    const capped = Math.min(5.0, Math.max(1.5, Math.ceil(peak * 2) / 2));
    return capped;
  }, [result, timeWindowMs, showAmRecovered, showFmRecovered]);

  // Modulated waveform y-bounds
  const amModYBound = useMemo(() => {
    const base = params.ac * (1 + params.muA);
    const noisePad = modView === 'received' ? params.sigmaN * 2.5 : 0;
    return Math.max(0.8, Math.ceil((base + noisePad) * 1.15 * 4) / 4);
  }, [params.ac, params.muA, params.sigmaN, modView]);

  const fmModYBound = useMemo(() => {
    const noisePad = modView === 'received' ? params.sigmaN * 2.5 : 0;
    return Math.max(0.8, Math.ceil((params.ac + noisePad) * 1.2 * 4) / 4);
  }, [params.ac, params.sigmaN, modView]);

  // Traces for Message Waveform
  const messageTraces: TraceSeries[] = useMemo(
    () => [
      {
        id: 'msg',
        label: 'm(t)',
        color: '#0f172a',
        data: result.message,
        lineWidth: 1.8,
        unit: 'V',
      },
    ],
    [result.message]
  );

  // Traces for Recovered Comparison
  const recoveredTraces: TraceSeries[] = useMemo(() => {
    const list: TraceSeries[] = [];
    if (showMessageRef) {
      list.push({
        id: 'ref',
        label: 'Message m(t)',
        color: '#64748b',
        data: result.message,
        lineWidth: 1.4,
        dashed: true,
        alpha: 0.85,
        unit: 'V',
      });
    }
    if (showAmRecovered) {
      list.push({
        id: 'am-rec',
        label: 'AM Envelope',
        color: '#d97706',
        data: result.amRecovered,
        lineWidth: 1.8,
        unit: 'V',
      });
    }
    if (showFmRecovered) {
      list.push({
        id: 'fm-rec',
        label: 'FM Discrim.',
        color: '#2563eb',
        data: result.fmRecovered,
        lineWidth: 1.8,
        unit: 'V',
      });
    }
    return list;
  }, [result, showMessageRef, showAmRecovered, showFmRecovered]);

  // Traces for Modulated AM & FM
  const amModTraces: TraceSeries[] = useMemo(() => {
    const list: TraceSeries[] = [
      {
        id: 'am-car',
        label: modView === 'received' ? 'r_AM(t)' : 's_AM(t)',
        color: '#d97706',
        data: modView === 'received' ? result.amReceived : result.amModulated,
        lineWidth: 1.25,
        unit: 'V',
      },
    ];
    if (modView === 'transmitted') {
      list.push(
        {
          id: 'am-env-u',
          label: '+Envelope',
          color: '#0f172a',
          data: result.amEnvelopeUpper,
          lineWidth: 1.2,
          dashed: true,
          alpha: 0.7,
          unit: 'V',
        },
        {
          id: 'am-env-l',
          label: '-Envelope',
          color: '#0f172a',
          data: result.amEnvelopeLower,
          lineWidth: 1.2,
          dashed: true,
          alpha: 0.7,
          unit: 'V',
        }
      );
    }
    return list;
  }, [result, modView]);

  const fmModTraces: TraceSeries[] = useMemo(
    () => [
      {
        id: 'fm-car',
        label: modView === 'received' ? 'r_FM(t)' : 's_FM(t)',
        color: '#2563eb',
        data: modView === 'received' ? result.fmReceived : result.fmModulated,
        lineWidth: 1.25,
        unit: 'V',
      },
    ],
    [result, modView]
  );

  // Spectrum data arrays
  const spectrumPlot = useMemo(() => {
    if (spectrumDomain === 'rf') {
      const freqs = result.rfSpectrum.map((b) => b.freqKHz);
      const amArr = result.rfSpectrum.map((b) =>
        spectrumScale === 'db' ? b.amDb : b.amMag
      );
      const fmArr = result.rfSpectrum.map((b) =>
        spectrumScale === 'db' ? b.fmDb : b.fmMag
      );

      const fc = result.carrierFreqKHz;
      const halfCarson = result.carsonBwKHz / 2;
      const halfAm = result.amBwKHz / 2;

      const bands: ShadedBand[] = [
        {
          label: `Carson BW ${result.carsonBwKHz.toFixed(1)} kHz`,
          xStart: fc - halfCarson,
          xEnd: fc + halfCarson,
          fillColor: 'rgba(37, 99, 235, 0.08)',
          borderColor: 'rgba(37, 99, 235, 0.45)',
          textColor: '#1d4ed8',
        },
        {
          label: `AM ${result.amBwKHz.toFixed(1)} kHz`,
          xStart: fc - halfAm,
          xEnd: fc + halfAm,
          fillColor: 'rgba(217, 119, 6, 0.10)',
          borderColor: 'rgba(217, 119, 6, 0.50)',
          textColor: '#b45309',
        },
      ];

      const yMax =
        spectrumScale === 'db'
          ? Math.max(6, Math.ceil((20 * Math.log10(Math.max(0.2, params.ac * 1.4)) + 6) / 10) * 10)
          : Math.max(0.5, Math.ceil(params.ac * 1.25 * 4) / 4);

      return {
        xValues: freqs,
        xMin: 25,
        xMax: 103,
        yMin: spectrumScale === 'db' ? -60 : 0,
        yMax,
        yUnit: spectrumScale === 'db' ? 'dBV' : 'V',
        shadedBands: bands,
        markers: [{ x: fc, label: 'fc', color: '#94a3b8' }],
        traces: [
          {
            id: 'rf-am',
            label: 'AM Spectrum',
            color: '#d97706',
            data: amArr,
            lineWidth: 1.6,
            unit: spectrumScale === 'db' ? 'dBV' : 'V',
          },
          {
            id: 'rf-fm',
            label: 'FM Spectrum',
            color: '#2563eb',
            data: fmArr,
            lineWidth: 1.6,
            unit: spectrumScale === 'db' ? 'dBV' : 'V',
          },
        ] as TraceSeries[],
      };
    }

    // Baseband output spectrum
    const freqs = result.basebandSpectrum.map((b) => b.freqKHz);
    const amArr = result.basebandSpectrum.map((b) =>
      spectrumScale === 'db' ? b.amRecDb : b.amRecMag
    );
    const fmArr = result.basebandSpectrum.map((b) =>
      spectrumScale === 'db' ? b.fmRecDb : b.fmRecMag
    );

    const markers = [
      { x: params.fmKHz, label: 'fm', color: '#64748b' },
      { x: params.fmKHz * 2, label: '2fm', color: '#cbd5e1' },
      { x: params.fmKHz * 3, label: '3fm', color: '#cbd5e1' },
    ];

    return {
      xValues: freqs,
      xMin: 0.2,
      xMax: 24,
      yMin: spectrumScale === 'db' ? -60 : 0,
      yMax: spectrumScale === 'db' ? 6 : 1.25,
      yUnit: spectrumScale === 'db' ? 'dBV' : 'V',
      shadedBands: [] as ShadedBand[],
      markers,
      traces: [
        {
          id: 'bb-am',
          label: 'AM Recovered',
          color: '#d97706',
          data: amArr,
          lineWidth: 1.65,
          unit: spectrumScale === 'db' ? 'dBV' : 'V',
        },
        {
          id: 'bb-fm',
          label: 'FM Recovered',
          color: '#2563eb',
          data: fmArr,
          lineWidth: 1.65,
          unit: spectrumScale === 'db' ? 'dBV' : 'V',
        },
      ] as TraceSeries[],
    };
  }, [result, spectrumDomain, spectrumScale, params.ac, params.fmKHz]);

  const thresholdRibbon =
    result.thresholdStatus === 'above'
      ? {
          glyph: '●',
          text: 'Above FM Threshold',
          cls: 'text-emerald-700',
        }
      : result.thresholdStatus === 'near'
      ? {
          glyph: '▲',
          text: 'Near FM Threshold (~10 dB)',
          cls: 'text-amber-700',
        }
      : {
          glyph: '✖',
          text: 'Below FM Threshold',
          cls: 'text-rose-700',
        };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ECEG-3174 Signal Lab
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#metrics"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Metrics
            </a>
            <a
              href="#recovery"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Recovery
            </a>
            <a
              href="#modulated"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Waveforms
            </a>
            <a
              href="#spectrum"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Spectrum
            </a>
            <a
              href="#theory"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Theory
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Defaults
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {/* Workspace Hero & Channel Condition Preset Toolbar */}
        <div className="mb-5 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 text-balance">
              AM vs. FM Analog Communication Simulator
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>3–5 kHz Baseband Tone</span>
              <span aria-hidden="true">·</span>
              <span>Comparable Received Carrier Conditions</span>
              <span aria-hidden="true">·</span>
              <span className={`font-semibold ${thresholdRibbon.cls}`}>
                {thresholdRibbon.glyph} {thresholdRibbon.text} (
                {result.fmInputCnrDb >= 79.5 ? '>80' : result.fmInputCnrDb.toFixed(1)} dB CNR)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Channel condition presets"
              className="flex items-center gap-1 rounded-md bg-slate-100 p-1"
            >
              {(['clean', 'moderate', 'weak'] as const).map((key) => {
                const isActive = activePreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    title={PRESET_CONFIGS[key].description}
                    className={`min-h-[38px] rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {PRESET_CONFIGS[key].label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleResampleNoise}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Resample Noise
            </button>
          </div>
        </div>

        {/* Asymmetric Split Console */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Left Control Column */}
          <div className="w-full lg:w-[340px] xl:w-[360px] shrink-0">
            <ControlDeck
              params={params}
              result={result}
              onChange={handlePatch}
            />
          </div>

          {/* Right Main Stage */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {/* Numerical Readouts */}
            <MetricsBar result={result} />

            {/* Plot 1 & Plot 2: Message + Recovered AM vs. FM */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* Message Signal Plot */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Message Signal m(t)
                    </h2>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      cos(2π · {params.fmKHz.toFixed(1)} kHz · t) · Aₘ = 1.00 V
                    </div>
                  </div>
                  <div
                    role="group"
                    aria-label="Time window zoom"
                    className="flex items-center gap-1 rounded bg-slate-100 p-0.5"
                  >
                    {([0.5, 1.0, 2.0] as TimeWindowMs[]).map((win) => (
                      <button
                        key={win}
                        type="button"
                        onClick={() => setTimeWindowMs(win)}
                        className={`rounded px-2 py-1 font-mono text-[11px] whitespace-nowrap transition-colors ${
                          timeWindowMs === win
                            ? 'bg-white font-semibold text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {win.toFixed(1)} ms
                      </button>
                    ))}
                  </div>
                </div>
                <SignalCanvas
                  xValues={result.timeMs}
                  traces={messageTraces}
                  xMin={0}
                  xMax={timeWindowMs}
                  yMin={-1.35}
                  yMax={1.35}
                  xUnit="ms"
                  yUnit="V"
                  xTicks={5}
                  yTicks={4}
                  height={210}
                  ariaLabel="Baseband message waveform m(t)"
                />
              </div>

              {/* Recovered Waveforms Comparison Plot */}
              <div
                id="recovery"
                className="rounded-lg border border-slate-200 bg-white p-4 xl:col-span-7"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Recovered Waveforms (AM vs. FM)
                    </h2>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      AM SNR {result.amOutputSnrDb.toFixed(1)} dB · FM SNR{' '}
                      {result.fmOutputSnrDb.toFixed(1)} dB
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowMessageRef((v) => !v)}
                      aria-pressed={showMessageRef}
                      className={`rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        showMessageRef
                          ? 'border-slate-300 bg-slate-100 text-slate-900'
                          : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      Ref m(t)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAmRecovered((v) => !v)}
                      aria-pressed={showAmRecovered}
                      className={`rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        showAmRecovered
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      AM Envelope
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFmRecovered((v) => !v)}
                      aria-pressed={showFmRecovered}
                      className={`rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors ${
                        showFmRecovered
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      FM Discrim.
                    </button>
                  </div>
                </div>
                <SignalCanvas
                  xValues={result.timeMs}
                  traces={recoveredTraces}
                  xMin={0}
                  xMax={timeWindowMs}
                  yMin={-recoveredYBound}
                  yMax={recoveredYBound}
                  xUnit="ms"
                  yUnit="V"
                  xTicks={5}
                  yTicks={4}
                  height={210}
                  ariaLabel="Recovered AM and FM waveforms compared with original message"
                />
              </div>
            </div>

            {/* Plot 3: Modulated Waveforms (AM & FM synchronized) */}
            <section
              id="modulated"
              aria-label="Modulated Carrier Waveforms"
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Modulated Carrier Waveforms (f<sub>c</sub> ={' '}
                    {result.carrierFreqKHz.toFixed(1)} kHz)
                  </h2>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    AM μₐ = {params.muA.toFixed(2)} · FM Δf ={' '}
                    {params.deltaFKHz.toFixed(1)} kHz (β = {result.beta.toFixed(2)})
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="Modulated signal view mode"
                  className="flex items-center gap-1 rounded-md bg-slate-100 p-1"
                >
                  <button
                    type="button"
                    onClick={() => setModView('transmitted')}
                    className={`min-h-[34px] rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      modView === 'transmitted'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Clean Modulated
                  </button>
                  <button
                    type="button"
                    onClick={() => setModView('received')}
                    className={`min-h-[34px] rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      modView === 'received'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Received (+ Noise)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-amber-800">
                      AM Carrier {modView === 'received' ? 'r_AM(t)' : 's_AM(t)'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {modView === 'transmitted'
                        ? 'Dashed: ±A_c(1 + μₐ m(t))'
                        : `σₙ = ${params.sigmaN.toFixed(2)} Vrms`}
                    </span>
                  </div>
                  <SignalCanvas
                    xValues={result.timeMs}
                    traces={amModTraces}
                    xMin={0}
                    xMax={timeWindowMs}
                    yMin={-amModYBound}
                    yMax={amModYBound}
                    xUnit="ms"
                    yUnit="V"
                    xTicks={5}
                    yTicks={4}
                    height={190}
                    ariaLabel="AM modulated waveform"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-blue-800">
                      FM Carrier {modView === 'received' ? 'r_FM(t)' : 's_FM(t)'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      Constant Envelope A_c = {params.ac.toFixed(2)} V
                    </span>
                  </div>
                  <SignalCanvas
                    xValues={result.timeMs}
                    traces={fmModTraces}
                    xMin={0}
                    xMax={timeWindowMs}
                    yMin={-fmModYBound}
                    yMax={fmModYBound}
                    xUnit="ms"
                    yUnit="V"
                    xTicks={5}
                    yTicks={4}
                    height={190}
                    ariaLabel="FM modulated waveform"
                  />
                </div>
              </div>
            </section>

            {/* Plot 4: Magnitude Spectrum */}
            <section
              id="spectrum"
              aria-label="Magnitude Spectrum Analyzer"
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Magnitude Spectrum
                  </h2>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {spectrumDomain === 'rf'
                      ? `Passband around f_c = ${result.carrierFreqKHz.toFixed(1)} kHz · AM BW = ${result.amBwKHz.toFixed(1)} kHz · Carson = ${result.carsonBwKHz.toFixed(1)} kHz`
                      : `Baseband output harmonics (fₘ = ${params.fmKHz.toFixed(1)} kHz, 2fₘ = ${(params.fmKHz * 2).toFixed(1)} kHz, 3fₘ = ${(params.fmKHz * 3).toFixed(1)} kHz)`}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Spectrum domain"
                    className="flex items-center gap-1 rounded-md bg-slate-100 p-1"
                  >
                    <button
                      type="button"
                      onClick={() => setSpectrumDomain('rf')}
                      className={`min-h-[34px] rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        spectrumDomain === 'rf'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      RF / IF Passband
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpectrumDomain('baseband')}
                      className={`min-h-[34px] rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        spectrumDomain === 'baseband'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Baseband Output
                    </button>
                  </div>

                  <div
                    role="group"
                    aria-label="Magnitude scale"
                    className="flex items-center gap-1 rounded-md bg-slate-100 p-1"
                  >
                    <button
                      type="button"
                      onClick={() => setSpectrumScale('db')}
                      className={`min-h-[34px] rounded px-2.5 py-1 font-mono text-xs font-medium whitespace-nowrap transition-colors ${
                        spectrumScale === 'db'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      dBV
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpectrumScale('linear')}
                      className={`min-h-[34px] rounded px-2.5 py-1 font-mono text-xs font-medium whitespace-nowrap transition-colors ${
                        spectrumScale === 'linear'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Linear
                    </button>
                  </div>
                </div>
              </div>

              <SignalCanvas
                xValues={spectrumPlot.xValues}
                traces={spectrumPlot.traces}
                xMin={spectrumPlot.xMin}
                xMax={spectrumPlot.xMax}
                yMin={spectrumPlot.yMin}
                yMax={spectrumPlot.yMax}
                xUnit="kHz"
                yUnit={spectrumPlot.yUnit}
                xTicks={8}
                yTicks={5}
                height={240}
                zeroLine={false}
                shadedBands={spectrumPlot.shadedBands}
                verticalMarkers={spectrumPlot.markers}
                ariaLabel="AM and FM magnitude spectrum"
              />

              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-amber-600" />
                  AM Magnitude
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-blue-600" />
                  FM Magnitude
                </span>
                {spectrumDomain === 'rf' && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                    Shaded: Carson B_T = 2(Δf + fₘ) vs. AM 2fₘ
                  </span>
                )}
              </div>
            </section>

            {/* Live ECEG-3174 Reference Notes */}
            <TheoryNotes params={params} result={result} />
          </div>
        </div>
      </main>
    </div>
  );
}
