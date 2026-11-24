import React from 'react';
import { SimParams, SimResult } from '../dsp/simulator';

interface TheoryNotesProps {
  params: SimParams;
  result: SimResult;
}

export const TheoryNotes: React.FC<TheoryNotesProps> = ({ params, result }) => {
  return (
    <section
      id="theory"
      aria-label="ECEG-3174 Theoretical Notes"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <h2 className="text-base font-semibold text-slate-900">
          ECEG-3174 Analog Modulation Reference
        </h2>
        <span className="font-mono text-xs text-slate-500">
          f<sub>c</sub> = {result.carrierFreqKHz.toFixed(1)} kHz · f<sub>s</sub> ={' '}
          {(result.sampleRateHz / 1000).toFixed(1)} kHz · N = {result.numSamples}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* AM Envelope Theory */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            01. AM Envelope Detection
          </h3>
          <p className="font-mono text-xs text-slate-700 bg-slate-50 rounded px-2.5 py-2 border border-slate-200/70">
            s<sub>AM</sub>(t) = A<sub>c</sub>[1 + μ<sub>a</sub> cos(2πf<sub>m</sub>t)] cos(2πf<sub>c</sub>t)
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            {params.muA > 1.001 ? (
              <>
                With <span className="font-mono font-medium text-rose-700">μₐ = {params.muA.toFixed(2)} &gt; 1</span>, the envelope{' '}
                <span className="font-mono">1 + μₐ m(t)</span> turns negative on troughs, causing carrier phase reversals that the envelope detector rectifies into{' '}
                <span className="font-mono font-medium text-rose-700">{result.amThdPct.toFixed(1)}% THD</span>.
              </>
            ) : (
              <>
                At <span className="font-mono font-medium text-slate-800">μₐ = {params.muA.toFixed(2)} ≤ 1</span>, the envelope remains non-negative so envelope recovery stays linear within{' '}
                <span className="font-mono">2fₘ = {result.amBwKHz.toFixed(1)} kHz</span> bandwidth.
              </>
            )}
          </p>
        </div>

        {/* FM & Carson's Rule */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            02. FM & Carson Bandwidth
          </h3>
          <p className="font-mono text-xs text-slate-700 bg-slate-50 rounded px-2.5 py-2 border border-slate-200/70">
            β = Δf / f<sub>m</sub> = {result.beta.toFixed(2)} · B<sub>T</sub> = 2(Δf + f<sub>m</sub>) = {result.carsonBwKHz.toFixed(1)} kHz
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            Expanding peak deviation trades wider RF bandwidth{' '}
            <span className="font-mono">B_T</span> for quadratic baseband SNR improvement proportional to{' '}
            <span className="font-mono">3β²/2</span> above threshold. Narrow IF filtering below{' '}
            <span className="font-mono">{result.carsonBwKHz.toFixed(1)} kHz</span> clips Bessel sidebands and raises FM distortion.
          </p>
        </div>

        {/* FM Threshold Effect */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            03. FM Threshold (~10 dB CNR)
          </h3>
          <p className="font-mono text-xs text-slate-700 bg-slate-50 rounded px-2.5 py-2 border border-slate-200/70">
            CNR<sub>FM</sub> = {result.fmInputCnrDb >= 79.5 ? '>80.0' : result.fmInputCnrDb.toFixed(1)} dB · SNR<sub>FM</sub> = {result.fmOutputSnrDb.toFixed(1)} dB
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            {result.thresholdStatus === 'below' ? (
              <>
                <span className="font-medium text-rose-700">Below threshold</span>: noise vectors frequently encircle the origin, creating 2π phase slips (&ldquo;FM clicks&rdquo;) that collapse output SNR below AM.
              </>
            ) : result.thresholdStatus === 'near' ? (
              <>
                <span className="font-medium text-amber-700">Near the 10 dB knee</span>: occasional impulse clicks begin appearing in the FM discriminator output as noise peaks rival A<sub>c</sub>.
              </>
            ) : (
              <>
                <span className="font-medium text-emerald-700">Above threshold</span>: constant-envelope phase differentiation suppresses amplitude noise, yielding a{' '}
                <span className="font-mono">{result.fmGainOverAmDb >= 0 ? '+' : ''}{result.fmGainOverAmDb.toFixed(1)} dB</span> advantage over AM.
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
};
