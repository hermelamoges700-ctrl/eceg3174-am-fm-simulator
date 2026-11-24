/**
 * In-place Radix-2 Cooley-Tukey FFT / IFFT on Float64Array buffers.
 * Length N must be a power of 2.
 */
export function fft(re: Float64Array, im: Float64Array, invert = false): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;

      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  const dir = invert ? 1 : -1;

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (dir * 2 * Math.PI) / len;
    const wLenRe = Math.cos(angle);
    const wLenIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;

      for (let j = 0; j < half; j++) {
        const idx1 = i + j;
        const idx2 = idx1 + half;

        const uRe = re[idx1];
        const uIm = im[idx1];

        const vRe = re[idx2] * wRe - im[idx2] * wIm;
        const vIm = re[idx2] * wIm + im[idx2] * wRe;

        re[idx1] = uRe + vRe;
        im[idx1] = uIm + vIm;
        re[idx2] = uRe - vRe;
        im[idx2] = uIm - vIm;

        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        wIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
      }
    }
  }

  if (invert) {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}
