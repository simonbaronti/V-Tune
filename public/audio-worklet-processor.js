// Number of hops the phase-slope regression looks back over
const PHASE_HISTORY = 8;

class TunerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;

    // Blackman-Harris window (normalized to unity mean) — very low side
    // lobes (~-92dB) strongly suppress leakage from neighbouring partials
    this.window = new Float32Array(this.bufferSize);
    {
      const a0 = 0.35875, a1 = 0.48829, a2 = 0.14128, a3 = 0.01168;
      for (let i = 0; i < this.bufferSize; i++) {
        const t = (2 * Math.PI * i) / (this.bufferSize - 1);
        this.window[i] =
          (a0 - a1 * Math.cos(t) + a2 * Math.cos(2 * t) - a3 * Math.cos(3 * t)) / a0;
      }
    }
    this.windowed = new Float32Array(this.bufferSize);
    this.hopSize = 512;
    this.samplesSinceLastHop = 0;
    this.prevPhases = new Map();
    this.errorHistory = new Map();
    this.targetFrequencies = [440];
    this.referenceFreq = 440;
    this.sampleRate = 44100;
    this.rmsLevel = 0;

    // DC blocker state (one-pole high-pass, ~7Hz cutoff)
    this.dcX1 = 0;
    this.dcY1 = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'setTargets') {
        this.targetFrequencies = e.data.frequencies;
        this.referenceFreq = e.data.referenceFreq;
        this.prevPhases.clear();
        this.errorHistory.clear();
      }
      if (e.data.type === 'setSampleRate') {
        this.sampleRate = e.data.sampleRate;
      }
    };
  }

  goertzel(samples, targetFreq, sampleRate) {
    const N = samples.length;
    // Generalized (fractional-bin) Goertzel: evaluate the DTFT exactly at
    // targetFreq instead of snapping to the nearest integer FFT bin
    const omega = (2 * Math.PI * targetFreq) / sampleRate;
    const cosOmega = Math.cos(omega);
    const coeff = 2 * cosOmega;

    let s0 = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    const real = s1 - s2 * cosOmega;
    const imag = s2 * Math.sin(omega);
    const magnitude = Math.sqrt(real * real + imag * imag) / N;
    const phase = Math.atan2(imag, real);

    return { magnitude, phase };
  }

  // Analyze one frequency: Goertzel + hop-to-hop phase error corrected
  // against the expected phase advance. correctedError is proportional
  // to the detuning of any component near targetFreq.
  analyzeFreq(targetFreq) {
    const result = this.goertzel(this.windowed, targetFreq, this.sampleRate);

    const prevPhase = this.prevPhases.get(targetFreq);
    let phaseDelta = 0;
    if (prevPhase !== undefined) {
      phaseDelta = result.phase - prevPhase;
      while (phaseDelta > Math.PI) phaseDelta -= 2 * Math.PI;
      while (phaseDelta < -Math.PI) phaseDelta += 2 * Math.PI;
    }
    this.prevPhases.set(targetFreq, result.phase);

    const expectedPhaseDelta = (2 * Math.PI * targetFreq * this.hopSize) / this.sampleRate;
    let normalizedExpected = expectedPhaseDelta % (2 * Math.PI);
    if (normalizedExpected > Math.PI) normalizedExpected -= 2 * Math.PI;

    let correctedError = phaseDelta - normalizedExpected;
    while (correctedError > Math.PI) correctedError -= 2 * Math.PI;
    while (correctedError < -Math.PI) correctedError += 2 * Math.PI;

    return { magnitude: result.magnitude, phase: result.phase, correctedError };
  }

  computeRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  fftPeaks(samples, sampleRate) {
    const N = samples.length;
    const windowed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      windowed[i] = samples[i] * w;
    }

    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    real.set(windowed);

    // In-place iterative FFT
    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let j = 0;
      for (let b = 0; b < bits; b++) {
        j = (j << 1) | ((i >> b) & 1);
      }
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let size = 2; size <= N; size *= 2) {
      const half = size / 2;
      const angle = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < half; j++) {
          const cos = Math.cos(angle * j);
          const sin = Math.sin(angle * j);
          const tr = real[i + j + half] * cos - imag[i + j + half] * sin;
          const ti = real[i + j + half] * sin + imag[i + j + half] * cos;
          real[i + j + half] = real[i + j] - tr;
          imag[i + j + half] = imag[i + j] - ti;
          real[i + j] += tr;
          imag[i + j] += ti;
        }
      }
    }

    const magnitudes = new Float32Array(N / 2);
    let maxMag = 0;
    for (let i = 0; i < N / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / N;
      if (magnitudes[i] > maxMag) maxMag = magnitudes[i];
    }

    const peaks = [];
    const threshold = maxMag * 0.05;
    const binWidth = sampleRate / N;
    for (let i = 2; i < N / 2 - 1; i++) {
      if (magnitudes[i] > threshold &&
          magnitudes[i] > magnitudes[i - 1] &&
          magnitudes[i] > magnitudes[i + 1]) {
        // Parabolic interpolation for sub-bin accuracy
        const alpha = magnitudes[i - 1];
        const beta = magnitudes[i];
        const gamma = magnitudes[i + 1];
        const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
        const freq = (i + p) * binWidth;
        const mag = beta - 0.25 * (alpha - gamma) * p;
        peaks.push({ freq, magnitude: mag, db: 20 * Math.log10(mag / maxMag) });
      }
    }

    peaks.sort((a, b) => b.magnitude - a.magnitude);
    return peaks.slice(0, 32);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      // One-pole DC blocker: removes rumble/handling noise that would
      // otherwise bias the lowest band
      const x = channelData[i];
      const y = x - this.dcX1 + 0.999 * this.dcY1;
      this.dcX1 = x;
      this.dcY1 = y;
      this.buffer[this.writeIndex] = y;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.samplesSinceLastHop++;
    }

    if (this.samplesSinceLastHop < this.hopSize) return true;
    this.samplesSinceLastHop = 0;

    const analysis = new Float32Array(this.bufferSize);
    for (let i = 0; i < this.bufferSize; i++) {
      analysis[i] = this.buffer[(this.writeIndex + i) % this.bufferSize];
    }

    this.rmsLevel = this.computeRMS(analysis);

    // Window the buffer once for the Goertzel phase analysis
    for (let i = 0; i < this.bufferSize; i++) {
      this.windowed[i] = analysis[i] * this.window[i];
    }

    // Compute FFT peaks once per hop, before band analysis — the band loop
    // uses them to locate the dominant spectral peak near each target so
    // multi-modal signals (handpans, bells, multi-resonant instruments)
    // get the actual peak frequency rather than phase noise at a bin where
    // nothing is happening.
    const peaks = this.fftPeaks(analysis, this.sampleRate);

    const bandData = [];
    for (const freq of this.targetFrequencies) {
      const fundamental = this.analyzeFreq(freq);
      const combinedRate = fundamental.correctedError;

      // Multi-hop phase-slope regression: least-squares slope of the
      // cumulative phase over the last PHASE_HISTORY hops. A longer baseline
      // cuts quantization noise in the detuning estimate by ~sqrt(N).
      let hist = this.errorHistory.get(freq);
      if (!hist) {
        hist = [];
        this.errorHistory.set(freq, hist);
      }
      hist.push(combinedRate);
      if (hist.length > PHASE_HISTORY) hist.shift();

      let slope = combinedRate;
      const n = hist.length;
      if (n >= 3) {
        const xMean = (n - 1) / 2;
        let cum = 0;
        let yMean = 0;
        for (let i = 0; i < n; i++) {
          cum += hist[i];
          yMean += cum;
        }
        yMean /= n;
        let num = 0, den = 0;
        cum = 0;
        for (let i = 0; i < n; i++) {
          cum += hist[i];
          const dx = i - xMean;
          num += dx * (cum - yMean);
          den += dx * dx;
        }
        slope = num / den;
      }

      // PEAK-BASED MEASUREMENT
      // Find the strongest spectral peak within ±150¢ of this band's
      // target. The peak frequency (from parabolic interp on the FFT) is
      // the actual position of the dominant signal there — robust against
      // multi-modal instruments where the "expected" frequency may have
      // nothing at it and the real peak is a quarter-tone away.
      const lowBound = freq * Math.pow(2, -150 / 1200);
      const highBound = freq * Math.pow(2, 150 / 1200);
      let bestPeak = null;
      for (const p of peaks) {
        if (p.freq < lowBound || p.freq > highBound) continue;
        if (!bestPeak || p.magnitude > bestPeak.magnitude) bestPeak = p;
      }

      let centsDelta;
      let outSlope;
      if (bestPeak) {
        centsDelta = 1200 * Math.log2(bestPeak.freq / freq);
        outSlope = (2 * Math.PI * (bestPeak.freq - freq) * this.hopSize) / this.sampleRate;
      } else {
        // Fallback: phase-rate Goertzel/regression result (works for steady
        // tones where the band's exact target IS the signal frequency).
        const hzDelta = (slope * this.sampleRate) / (2 * Math.PI * this.hopSize);
        const ratio = 1 + hzDelta / freq;
        centsDelta = ratio > 0 ? 1200 * Math.log2(ratio) : 0;
        outSlope = slope;
      }

      bandData.push({
        targetFreq: freq,
        magnitude: fundamental.magnitude,
        phase: fundamental.phase,
        phaseDelta: outSlope,
        centsDelta,
      });
    }

    this.port.postMessage({
      type: 'analysis',
      bands: bandData,
      rmsLevel: this.rmsLevel,
      peaks,
    });

    return true;
  }
}

registerProcessor('tuner-processor', TunerProcessor);
