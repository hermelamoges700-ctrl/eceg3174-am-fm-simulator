import { fft } from './fft';

export type FilterSetting = 'matched' | 'narrow' | 'wide' | 'bypass';
export type ConditionPreset = 'clean' | 'moderate' | 'weak' | 'custom';
export type ThresholdStatus = 'above' | 'near' | 'below';

export interface SimParams {
  /** Message frequency in kHz (3.0 - 5.0 kHz) */
  fmKHz: number;
  /** AM modulation index mu_a (0.10 - 2.00) */
  muA: number;
  /** FM peak frequency deviation delta_f in kHz (1.0 - 25.0 kHz) */
  deltaFKHz: number;
  /** Received carrier amplitude A_c in Volts (0.20 - 2.00 V) */
  ac: number;
  /** Channel AWGN RMS noise level sigma_n in Volts (0.00 - 1.50 V) */
  sigmaN: number;
  /** Receiver IF + Audio filter configuration */
  filterSetting: FilterSetting;
  /** Seed for deterministic AWGN realization */
  noiseSeed: number;
}

export interface SpectrumBin {
  freqKHz: number;
  amMag: number;
  fmMag: number;
  amDb: number;
  fmDb: number;
}

export interface BasebandSpectrumBin {
  freqKHz: number;
  msgMag: number;
  amRecMag: number;
  fmRecMag: number;
  msgDb: number;
  amRecDb: number;
  fmRecDb: number;
}

export interface SimResult {
  sampleRateHz: number;
  carrierFreqKHz: number;
  numSamples: number;
  binHz: number;

  // Derived modulation specs
  beta: number;
  carsonBwKHz: number;
  amBwKHz: number;
  amIfBwKHz: number;
  fmIfBwKHz: number;
  amAfCutoffKHz: number;
  fmAfCutoffKHz: number;

  // Time-domain arrays (full 10 ms buffer)
  timeMs: Float64Array;
  message: Float64Array;
  amModulated: Float64Array;
  amEnvelopeUpper: Float64Array;
  amEnvelopeLower: Float64Array;
  amReceived: Float64Array;
  fmModulated: Float64Array;
  fmReceived: Float64Array;
  amRecovered: Float64Array;
  fmRecovered: Float64Array;

  // Spectrum arrays
  rfSpectrum: SpectrumBin[];
  basebandSpectrum: BasebandSpectrumBin[];

  // Numerical metrics
  amInputCnrDb: number;
  amInputSnrDb: number;
  fmInputCnrDb: number;
  amOutputSnrDb: number;
  fmOutputSnrDb: number;
  fmGainOverAmDb: number;
  amThdPct: number;
  fmThdPct: number;
  thresholdStatus: ThresholdStatus;
  thresholdMarginDb: number;
}

export const SAMPLE_RATE_HZ = 819_200; // 819.2 kHz
export const NUM_SAMPLES = 8192;       // T = 10.0 ms, bin spacing = 100 Hz
export const BIN_HZ = SAMPLE_RATE_HZ / NUM_SAMPLES; // 100 Hz
export const CARRIER_FREQ_KHZ = 64.0;
export const CARRIER_FREQ_HZ = CARRIER_FREQ_KHZ * 1000;
export const FM_THRESHOLD_DB = 10.0;

export const PRESET_CONFIGS: Record<
  Exclude<ConditionPreset, 'custom'>,
  { label: string; description: string; ac: number; sigmaN: number }
> = {
  clean: {
    label: 'Clean',
    description: 'High CNR (>30 dB), negligible channel noise',
    ac: 1.0,
    sigmaN: 0.04,
  },
  moderate: {
    label: 'Moderate Noise',
    description: 'Near FM threshold (~11.4 dB CNR at default deviation)',
    ac: 0.85,
    sigmaN: 0.58,
  },
  weak: {
    label: 'Weak Signal',
    description: 'Below FM threshold (<4 dB CNR), click noise crossover',
    ac: 0.45,
    sigmaN: 0.8,
  },
};

export const FILTER_DESCRIPTIONS: Record<
  FilterSetting,
  { label: string; summary: string }
> = {
  matched: {
    label: 'Matched',
    summary: 'AM IF = 2.4·fm / 16 kHz AF; FM IF = Carson / 5.5 kHz AF',
  },
  narrow: {
    label: 'Narrow 12k',
    summary: 'Shared 12 kHz IF BPF / 14 kHz AF LPF (clips wideband FM)',
  },
  wide: {
    label: 'Wide 48k',
    summary: 'Shared 48 kHz IF BPF / 12.0 kHz AF LPF (admits excess noise)',
  },
  bypass: {
    label: 'Wideband',
    summary: '120 kHz IF BPF / 20.0 kHz AF LPF (minimal noise rejection)',
  },
};

/** Mulberry32 deterministic PRNG */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateGaussianNoise(n: number, sigma: number, seed: number): Float64Array {
  const out = new Float64Array(n);
  if (sigma <= 0) return out;
  const rng = createRng(seed);
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const mag = sigma * Math.sqrt(-2.0 * Math.log(u1));
    const angle = 2.0 * Math.PI * u2;
    out[i] = mag * Math.cos(angle);
    if (i + 1 < n) {
      out[i + 1] = mag * Math.sin(angle);
    }
  }
  return out;
}

/**
 * Applies a zero-phase 4th-order Butterworth-like IF bandpass filter centered at fcHz
 * and returns both the real filtered IF signal and its analytic signal (zRe + j*zIm).
 */
function bandpassAndAnalytic(
  signal: Float64Array,
  fcHz: number,
  bwHz: number
): { realIf: Float64Array; zRe: Float64Array; zIm: Float64Array } {
  const n = signal.length;
  const half = n >> 1;
  const halfBw = Math.max(500, bwHz * 0.5);

  // First compute full spectrum once
  const specRe = new Float64Array(signal);
  const specIm = new Float64Array(n);
  fft(specRe, specIm, false);

  // Build real IF filtered spectrum
  const realRe = new Float64Array(n);
  const realIm = new Float64Array(n);

  // Build analytic IF filtered spectrum (positive frequencies x2)
  const anaRe = new Float64Array(n);
  const anaIm = new Float64Array(n);

  for (let k = 1; k < n; k++) {
    if (k === half) continue;
    const isPos = k < half;
    const freq = (isPos ? k : n - k) * BIN_HZ;
    const ratio = (freq - fcHz) / halfBw;
    const r2 = ratio * ratio;
    const r8 = r2 * r2 * r2 * r2; // 4th-order magnitude response (p = 4 -> 2p = 8)
    const gain = 1 / Math.sqrt(1 + r8);

    const sr = specRe[k] * gain;
    const si = specIm[k] * gain;

    realRe[k] = sr;
    realIm[k] = si;

    if (isPos) {
      anaRe[k] = 2 * sr;
      anaIm[k] = 2 * si;
    }
  }

  fft(realRe, realIm, true);
  fft(anaRe, anaIm, true);

  return { realIf: realRe, zRe: anaRe, zIm: anaIm };
}

/**
 * Applies a zero-phase 4th-order Butterworth baseband low-pass filter and removes DC.
 */
function lowPassBaseband(signal: Float64Array, cutoffHz: number): Float64Array {
  const n = signal.length;
  const half = n >> 1;
  const re = new Float64Array(signal);
  const im = new Float64Array(n);

  fft(re, im, false);

  // Remove DC
  re[0] = 0;
  im[0] = 0;
  re[half] = 0;
  im[half] = 0;

  for (let k = 1; k < n; k++) {
    if (k === half) continue;
    const freq = (k < half ? k : n - k) * BIN_HZ;
    const ratio = freq / cutoffHz;
    const r2 = ratio * ratio;
    const r8 = r2 * r2 * r2 * r2;
    const gain = 1 / Math.sqrt(1 + r8);
    re[k] *= gain;
    im[k] *= gain;
  }

  fft(re, im, true);
  return re;
}

function meanPower(arr: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i] * arr[i];
  }
  return sum / arr.length;
}

function toDb(linearRatio: number): number {
  if (!Number.isFinite(linearRatio) || linearRatio <= 1e-12) return -60;
  return 10 * Math.log10(linearRatio);
}

/**
 * Computes Output SNR (dB) and THD (%) from the FFT of a recovered baseband waveform.
 * Because fmKHz is quantized in 0.1 kHz steps and BIN_HZ = 100 Hz, fm and all harmonics
 * land on exact FFT bins with zero spectral leakage.
 */
function analyzeRecoveredBaseband(
  recovered: Float64Array,
  fmHz: number,
  evalMaxHz: number
): { snrDb: number; thdPct: number; magSpectrum: Float64Array } {
  const n = recovered.length;
  const half = n >> 1;
  const re = new Float64Array(recovered);
  const im = new Float64Array(n);
  fft(re, im, false);

  const magSpectrum = new Float64Array(half + 1);
  const binPowers = new Float64Array(half + 1);
  const norm = 2 / n;

  for (let k = 1; k <= half; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    binPowers[k] = p;
    magSpectrum[k] = Math.sqrt(p) * norm;
  }

  const fundBin = Math.max(1, Math.round(fmHz / BIN_HZ));
  const maxBin = Math.min(half - 1, Math.max(fundBin + 2, Math.round(evalMaxHz / BIN_HZ)));

  // Collect non-harmonic bin powers to estimate median broadband noise floor per bin
  const harmonicSet = new Set<number>();
  for (let h = 1; h <= 8; h++) {
    const hk = h * fundBin;
    if (hk <= maxBin) harmonicSet.add(hk);
  }

  const noiseSamples: number[] = [];
  let totalNonFundPower = 0;

  for (let k = 1; k <= maxBin; k++) {
    if (k === fundBin) continue;
    const p = binPowers[k];
    totalNonFundPower += p;
    if (!harmonicSet.has(k)) {
      noiseSamples.push(p);
    }
  }

  noiseSamples.sort((a, b) => a - b);
  const medianNoiseBin =
    noiseSamples.length > 0 ? noiseSamples[Math.floor(noiseSamples.length * 0.5)] : 0;

  const fundPower = Math.max(1e-18, binPowers[fundBin] - medianNoiseBin);

  let harmonicPower = 0;
  for (let h = 2; h <= 8; h++) {
    const hk = h * fundBin;
    if (hk > maxBin) break;
    // Subtract median noise floor so pure broadband noise doesn't masquerade as harmonics
    const excess = binPowers[hk] - medianNoiseBin * 1.8;
    if (excess > 0) {
      harmonicPower += excess;
    }
  }

  const thdPct = Math.min(200, 100 * Math.sqrt(harmonicPower / fundPower));
  const snrDb = Math.max(-25, Math.min(80, toDb(binPowers[fundBin] / Math.max(1e-18, totalNonFundPower))));

  return { snrDb, thdPct, magSpectrum };
}

export function runSimulation(params: SimParams): SimResult {
  const fmHz = params.fmKHz * 1000;
  const deltaFHz = params.deltaFKHz * 1000;
  const beta = deltaFHz / fmHz;
  const carsonBwKHz = 2 * (params.deltaFKHz + params.fmKHz);
  const amBwKHz = 2 * params.fmKHz;

  // Determine IF and Audio Filter cutoffs from Receiver Filter Setting
  let amIfBwKHz: number;
  let fmIfBwKHz: number;
  let amAfCutoffKHz: number;
  let fmAfCutoffKHz: number;

  switch (params.filterSetting) {
    case 'matched':
      amIfBwKHz = Math.max(8.0, 2.4 * params.fmKHz);
      fmIfBwKHz = Math.max(6.0, carsonBwKHz);
      amAfCutoffKHz = 16.0; // Passes 2fm/3fm overmodulation harmonics while removing 2fc ripple
      fmAfCutoffKHz = 5.5;  // Matched to 3-5 kHz message band for textbook FM noise quieting
      break;
    case 'narrow':
      amIfBwKHz = 12.0;
      fmIfBwKHz = 12.0;
      amAfCutoffKHz = 14.0;
      fmAfCutoffKHz = 14.0;
      break;
    case 'wide':
      amIfBwKHz = 48.0;
      fmIfBwKHz = 48.0;
      amAfCutoffKHz = 12.0;
      fmAfCutoffKHz = 12.0;
      break;
    case 'bypass':
      amIfBwKHz = 120.0;
      fmIfBwKHz = 120.0;
      amAfCutoffKHz = 20.0;
      fmAfCutoffKHz = 20.0;
      break;
  }

  const timeMs = new Float64Array(NUM_SAMPLES);
  const message = new Float64Array(NUM_SAMPLES);
  const amModulated = new Float64Array(NUM_SAMPLES);
  const amEnvelopeUpper = new Float64Array(NUM_SAMPLES);
  const amEnvelopeLower = new Float64Array(NUM_SAMPLES);
  const fmModulated = new Float64Array(NUM_SAMPLES);

  const twoPiFm = 2 * Math.PI * fmHz;
  const twoPiFc = 2 * Math.PI * CARRIER_FREQ_HZ;

  for (let n = 0; n < NUM_SAMPLES; n++) {
    const t = n / SAMPLE_RATE_HZ;
    timeMs[n] = t * 1000;

    const m = Math.cos(twoPiFm * t);
    message[n] = m;

    const instEnv = params.ac * (1 + params.muA * m);
    amModulated[n] = instEnv * Math.cos(twoPiFc * t);
    amEnvelopeUpper[n] = instEnv;
    amEnvelopeLower[n] = -instEnv;

    fmModulated[n] = params.ac * Math.cos(twoPiFc * t + beta * Math.sin(twoPiFm * t));
  }

  // Comparable AWGN channel realization
  const noise = generateGaussianNoise(NUM_SAMPLES, params.sigmaN, params.noiseSeed);
  const amReceived = new Float64Array(NUM_SAMPLES);
  const fmReceived = new Float64Array(NUM_SAMPLES);

  for (let n = 0; n < NUM_SAMPLES; n++) {
    amReceived[n] = amModulated[n] + noise[n];
    fmReceived[n] = fmModulated[n] + noise[n];
  }

  // Filter signal and noise separately too so we can compute exact empirical IF CNR & SNR
  const amSigIf = bandpassAndAnalytic(amModulated, CARRIER_FREQ_HZ, amIfBwKHz * 1000);
  const amNoiseIf = bandpassAndAnalytic(noise, CARRIER_FREQ_HZ, amIfBwKHz * 1000);
  const amTotIf = bandpassAndAnalytic(amReceived, CARRIER_FREQ_HZ, amIfBwKHz * 1000);

  const fmSigIf = bandpassAndAnalytic(fmModulated, CARRIER_FREQ_HZ, fmIfBwKHz * 1000);
  const fmNoiseIf = bandpassAndAnalytic(noise, CARRIER_FREQ_HZ, fmIfBwKHz * 1000);
  const fmTotIf = bandpassAndAnalytic(fmReceived, CARRIER_FREQ_HZ, fmIfBwKHz * 1000);

  const carrierPower = 0.5 * params.ac * params.ac;
  const amNoiseIfPower = Math.max(1e-18, meanPower(amNoiseIf.realIf));
  const amSigIfPower = meanPower(amSigIf.realIf);
  const fmNoiseIfPower = Math.max(1e-18, meanPower(fmNoiseIf.realIf));
  const fmSigIfPower = meanPower(fmSigIf.realIf);

  const amInputCnrDb = params.sigmaN <= 0 ? 80 : Math.min(80, toDb(carrierPower / amNoiseIfPower));
  const amInputSnrDb = params.sigmaN <= 0 ? 80 : Math.min(80, toDb(amSigIfPower / amNoiseIfPower));
  const fmInputCnrDb = params.sigmaN <= 0 ? 80 : Math.min(80, toDb(fmSigIfPower / fmNoiseIfPower));

  // AM Envelope Detection: |z_AM(t)| -> AF LPF -> scale by 1 / (Ac * mu_a)
  const amEnvRaw = new Float64Array(NUM_SAMPLES);
  const amScale = 1 / Math.max(1e-6, params.ac * params.muA);
  for (let n = 0; n < NUM_SAMPLES; n++) {
    const zr = amTotIf.zRe[n];
    const zi = amTotIf.zIm[n];
    amEnvRaw[n] = Math.hypot(zr, zi) * amScale;
  }
  const amRecovered = lowPassBaseband(amEnvRaw, amAfCutoffKHz * 1000);

  // FM Discriminator: complex phase difference -> subtract fc -> divide by delta_f -> AF LPF
  const fmFreqRaw = new Float64Array(NUM_SAMPLES);
  const omegaC = (2 * Math.PI * CARRIER_FREQ_HZ) / SAMPLE_RATE_HZ;
  const fmScale = SAMPLE_RATE_HZ / (2 * Math.PI * Math.max(100, deltaFHz));
  for (let n = 0; n < NUM_SAMPLES; n++) {
    const prev = n === 0 ? NUM_SAMPLES - 1 : n - 1;
    const ar = fmTotIf.zRe[n];
    const ai = fmTotIf.zIm[n];
    const br = fmTotIf.zRe[prev];
    const bi = fmTotIf.zIm[prev];

    // z[n] * conj(z[n-1])
    const crossRe = ar * br + ai * bi;
    const crossIm = ai * br - ar * bi;
    const dPhi = Math.atan2(crossIm, crossRe);
    fmFreqRaw[n] = (dPhi - omegaC) * fmScale;
  }
  const fmRecovered = lowPassBaseband(fmFreqRaw, fmAfCutoffKHz * 1000);

  // Compute Output SNR & THD%
  // Evaluate AM over full audio bandwidth (passes 2fm/3fm overmodulation harmonics),
  // and FM over its post-detection filter bandwidth.
  const amEval = analyzeRecoveredBaseband(
    amRecovered,
    fmHz,
    Math.max(16_000, amAfCutoffKHz * 1000)
  );
  const fmEval = analyzeRecoveredBaseband(
    fmRecovered,
    fmHz,
    Math.max(6_000, fmAfCutoffKHz * 1000)
  );
  const msgEval = analyzeRecoveredBaseband(message, fmHz, 20_000);

  // Compute RF/IF Magnitude Spectra (25 kHz to 103 kHz around fc = 64 kHz)
  const amSpecRe = new Float64Array(amReceived);
  const amSpecIm = new Float64Array(NUM_SAMPLES);
  fft(amSpecRe, amSpecIm, false);

  const fmSpecRe = new Float64Array(fmReceived);
  const fmSpecIm = new Float64Array(NUM_SAMPLES);
  fft(fmSpecRe, fmSpecIm, false);

  const rfMinBin = Math.round(25_000 / BIN_HZ);
  const rfMaxBin = Math.round(103_000 / BIN_HZ);
  const specNorm = 2 / NUM_SAMPLES;
  const rfSpectrum: SpectrumBin[] = [];

  for (let k = rfMinBin; k <= rfMaxBin; k++) {
    const amMag = Math.hypot(amSpecRe[k], amSpecIm[k]) * specNorm;
    const fmMag = Math.hypot(fmSpecRe[k], fmSpecIm[k]) * specNorm;
    rfSpectrum.push({
      freqKHz: (k * BIN_HZ) / 1000,
      amMag,
      fmMag,
      amDb: 20 * Math.log10(Math.max(1e-5, amMag)),
      fmDb: 20 * Math.log10(Math.max(1e-5, fmMag)),
    });
  }

  // Compute Baseband Output Spectra (0.2 kHz to 24 kHz)
  const bbMinBin = 2;
  const bbMaxBin = Math.round(24_000 / BIN_HZ);
  const basebandSpectrum: BasebandSpectrumBin[] = [];
  for (let k = bbMinBin; k <= bbMaxBin; k++) {
    const msgMag = msgEval.magSpectrum[k];
    const amRecMag = amEval.magSpectrum[k];
    const fmRecMag = fmEval.magSpectrum[k];
    basebandSpectrum.push({
      freqKHz: (k * BIN_HZ) / 1000,
      msgMag,
      amRecMag,
      fmRecMag,
      msgDb: 20 * Math.log10(Math.max(1e-5, msgMag)),
      amRecDb: 20 * Math.log10(Math.max(1e-5, amRecMag)),
      fmRecDb: 20 * Math.log10(Math.max(1e-5, fmRecMag)),
    });
  }

  const thresholdMarginDb = fmInputCnrDb - FM_THRESHOLD_DB;
  let thresholdStatus: ThresholdStatus = 'above';
  if (fmInputCnrDb < 8.5) {
    thresholdStatus = 'below';
  } else if (fmInputCnrDb < 12.0) {
    thresholdStatus = 'near';
  }

  return {
    sampleRateHz: SAMPLE_RATE_HZ,
    carrierFreqKHz: CARRIER_FREQ_KHZ,
    numSamples: NUM_SAMPLES,
    binHz: BIN_HZ,
    beta,
    carsonBwKHz,
    amBwKHz,
    amIfBwKHz,
    fmIfBwKHz,
    amAfCutoffKHz,
    fmAfCutoffKHz,
    timeMs,
    message,
    amModulated,
    amEnvelopeUpper,
    amEnvelopeLower,
    amReceived,
    fmModulated,
    fmReceived,
    amRecovered,
    fmRecovered,
    rfSpectrum,
    basebandSpectrum,
    amInputCnrDb,
    amInputSnrDb,
    fmInputCnrDb,
    amOutputSnrDb: amEval.snrDb,
    fmOutputSnrDb: fmEval.snrDb,
    fmGainOverAmDb: fmEval.snrDb - amEval.snrDb,
    amThdPct: amEval.thdPct,
    fmThdPct: fmEval.thdPct,
    thresholdStatus,
    thresholdMarginDb,
  };
}
