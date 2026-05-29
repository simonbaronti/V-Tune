import { useRef, useEffect, useCallback, useState } from 'react';
import { useTunerStore, MAX_ISOLATIONS } from '../store/tunerStore';
import { getAnalyserNode, getAudioContext, setAnalyserFftSize, setAnalyserSmoothing } from '../audio/AudioEngine';
import { frequencyToNote, getDisplayName } from '../utils/notes';

// How long the finger has to sit still before a touch-drag becomes an
// iso-create gesture (ms). Anything shorter is treated as a pan.
const TOUCH_HOLD_MS = 350;
// How far the mouse can have moved before "shift+drag" is interpreted as
// the user trying to create an iso rather than nudge the pan a hair.
const DRAG_THRESHOLD_PX = 4;

const MIN_FREQ = 20;
const MAX_FREQ = 5000;
// Zoom limits expressed as a log10 frequency span.
// Full range ≈ 2.9; the small min lets you zoom right in on a single peak
// (~0.008 ≈ a ±1% window, e.g. ~±10 Hz around 1 kHz).
const MAX_LOG_SPAN = Math.log10(MAX_FREQ) - Math.log10(MIN_FREQ);
const MIN_LOG_SPAN = 0.008;
const DB_FLOOR = -100;
const DB_CEIL = -10;

function freqToX(freq: number, width: number, minF: number, maxF: number): number {
  const logMin = Math.log10(minF);
  const logMax = Math.log10(maxF);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
}

function xToFreq(x: number, width: number, minF: number, maxF: number): number {
  const logMin = Math.log10(minF);
  const logMax = Math.log10(maxF);
  const logF = logMin + (x / width) * (logMax - logMin);
  return Math.pow(10, logF);
}

function dbToY(db: number, height: number, floor: number, ceil: number): number {
  const clamped = Math.max(floor, Math.min(ceil, db));
  return height - ((clamped - floor) / (ceil - floor)) * height;
}

function formatFreq(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(1)}k`;
  return `${Math.round(f)}`;
}

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dataRef = useRef<Float32Array | null>(null);
  const smoothDataRef = useRef<Float32Array | null>(null);
  const peakHoldRef = useRef<Float32Array | null>(null);

  const bands = useTunerStore((s) => s.bands);
  const fftSize = useTunerStore((s) => s.fftSize);
  const fftSmoothing = useTunerStore((s) => s.fftSmoothing);
  const isolations = useTunerStore((s) => s.isolations);

  const [viewRange, setViewRange] = useState<[number, number]>([MIN_FREQ, MAX_FREQ]);
  const [threshold, setThreshold] = useState(-60);
  // Pending isolation being painted right now via mouse/touch drag. Stored
  // in component state (not the store) until commit on pointer-up — keeps
  // the per-frame canvas redraw cheap and the store noise-free.
  const [pendingIso, setPendingIso] = useState<{ startFreq: number; currentFreq: number } | null>(null);
  const pendingIsoRef = useRef(pendingIso);
  pendingIsoRef.current = pendingIso;
  const [dragState, setDragState] = useState<{
    type:
      | 'pan'             // dragging the view left/right
      | 'iso-create'      // dragging out a new isolation window
      | 'iso-resize-left'
      | 'iso-resize-right'
      | 'threshold'
      | null;
    startX: number;
    startY: number;
    startThreshold: number;
    // For panning: where the view range was when the drag began.
    startRange: [number, number];
    // For iso-resize: which isolation, and its starting bracket.
    isoId: string | null;
    startIsoMin: number;
    startIsoMax: number;
    // For iso-create: frequency under the pointer at start.
    startFreq: number;
  }>({
    type: null,
    startX: 0,
    startY: 0,
    startThreshold: -60,
    startRange: [MIN_FREQ, MAX_FREQ],
    isoId: null,
    startIsoMin: 0,
    startIsoMax: 0,
    startFreq: 0,
  });

  // Hover position (canvas-relative pixels). Used to render the live
  // freq/note readout that follows the cursor across the spectrum.
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  // Mirror of dragState so the rAF draw loop can read it without forcing
  // re-renders on every move.
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const viewRangeRef = useRef(viewRange);
  viewRangeRef.current = viewRange;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const isolationsRef = useRef(isolations);
  isolationsRef.current = isolations;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    const w = rect.width;
    const h = rect.height;

    const [minF, maxF] = viewRangeRef.current;
    const currentThreshold = thresholdRef.current;
    const store = useTunerStore.getState();
    const currentNaming = store.noteNaming;
    const refFreq = store.referenceFreq;

    // Background
    ctx.fillStyle = '#08080e';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000];
    for (const gf of gridFreqs) {
      if (gf < minF || gf > maxF) continue;
      const gx = freqToX(gf, w, minF, maxF);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
      ctx.fillStyle = '#787878';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatFreq(gf)}`, gx, h - 4);
    }

    // dB grid
    for (let db = -90; db <= -10; db += 10) {
      const gy = dbToY(db, h - 20, DB_FLOOR, DB_CEIL);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
      ctx.fillStyle = '#787878';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${db}`, 2, gy - 2);
    }

    // Threshold line
    const threshY = dbToY(currentThreshold, h - 20, DB_FLOOR, DB_CEIL);
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${currentThreshold} dB`, w - 4, threshY - 4);

    // FFT data (only when audio is active)
    const analyser = getAnalyserNode();
    const actx = getAudioContext();
    if (analyser && actx) {
      const binCount = analyser.frequencyBinCount;
      const sampleRate = actx.sampleRate;
      const freqPerBin = sampleRate / (binCount * 2);

      if (!dataRef.current || dataRef.current.length !== binCount) {
        dataRef.current = new Float32Array(binCount);
        smoothDataRef.current = new Float32Array(binCount);
        peakHoldRef.current = new Float32Array(binCount).fill(DB_FLOOR);
      }

      analyser.getFloatFrequencyData(dataRef.current as Float32Array<ArrayBuffer>);

      const raw = dataRef.current;
      const smooth = smoothDataRef.current!;
      const peaks = peakHoldRef.current!;
      // AnalyserNode already applies temporal smoothing via
      // smoothingTimeConstant, so use its output directly. The threshold
      // line acts as a noise gate — anything below it is flattened to the
      // floor so only peaks above the line survive.
      for (let i = 0; i < binCount; i++) {
        let val = isFinite(raw[i]) ? raw[i] : DB_FLOOR;
        if (val < currentThreshold) val = DB_FLOOR;
        smooth[i] = val;
        if (smooth[i] > peaks[i]) {
          peaks[i] = smooth[i];
        } else {
          peaks[i] -= 0.3;
        }
      }

      // Draw spectrum fill
      ctx.beginPath();
      ctx.moveTo(0, h - 20);
      let firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(smooth[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, h - 20);
          ctx.lineTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineTo(w, h - 20);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
      grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.2)');
      grad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw spectrum line
      ctx.beginPath();
      firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(smooth[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Peak hold line
      ctx.beginPath();
      firstPoint = true;
      for (let i = 1; i < binCount; i++) {
        const freq = i * freqPerBin;
        if (freq < minF || freq > maxF) continue;
        const x = freqToX(freq, w, minF, maxF);
        const y = dbToY(peaks[i], h - 20, DB_FLOOR, DB_CEIL);
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ── Isolation peak detection ────────────────────────────────────
      // Scan the *threshold-gated* smooth[] array for the strongest bin
      // inside each isolation's window. Because anything below the user's
      // threshold line was flattened to DB_FLOOR above, a silent room or
      // a quiet harmonic produces no peak at all (push null) instead of
      // a random noise-floor bin. This is what stops the strobe from
      // going beserk between strikes.
      const isoStore = useTunerStore.getState();
      const isosNow = isolationsRef.current;
      const PEAK_MIN_DB = currentThreshold; // explicit: gated by user line
      for (let k = 0; k < isosNow.length; k++) {
        const iso = isosNow[k];
        const i0 = Math.max(1, Math.floor(iso.minFreq / freqPerBin));
        const i1 = Math.min(binCount - 2, Math.ceil(iso.maxFreq / freqPerBin));
        let bestBin = -1;
        let bestVal = PEAK_MIN_DB; // ignore anything that didn't survive the gate
        for (let i = i0; i <= i1; i++) {
          // Local-max requirement avoids picking a sloped tail
          if (smooth[i] > bestVal && smooth[i] >= smooth[i - 1] && smooth[i] >= smooth[i + 1]) {
            bestVal = smooth[i];
            bestBin = i;
          }
        }
        let newPeak: number | null = null;
        if (bestBin > 0) {
          // Parabolic interpolation in dB → sub-bin frequency
          const a = smooth[bestBin - 1];
          const b = smooth[bestBin];
          const c = smooth[bestBin + 1];
          const denom = a - 2 * b + c;
          const p = denom !== 0 ? 0.5 * (a - c) / denom : 0;
          newPeak = (bestBin + p) * freqPerBin;
        }
        // Only push when meaningfully changed (>0.3 Hz) or on null/non-null
        // flip, to avoid re-render churn every animation frame.
        const cur = iso.peakFreq;
        const flipped = (cur === null) !== (newPeak === null);
        const moved =
          cur !== null && newPeak !== null && Math.abs(newPeak - cur) > 0.3;
        if (flipped || moved) {
          isoStore.setIsolationPeak(iso.id, newPeak);
        }
      }
    } else {
      // Analyser not running — clear any stale peak so the bandlets show
      // "no peak in window" instead of locking onto whatever was last there.
      const isoStore = useTunerStore.getState();
      for (const iso of isolationsRef.current) {
        if (iso.peakFreq !== null) isoStore.setIsolationPeak(iso.id, null);
      }
    }

    // Band frequency markers
    for (const band of bands) {
      if (band.frequency < minF || band.frequency > maxF) continue;
      const bx = freqToX(band.frequency, w, minF, maxF);
      ctx.strokeStyle = 'rgba(0, 232, 120, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${band.noteName}${band.octave}`, bx, 12);
    }

    // Isolation windows — draw each existing one, then the in-progress
    // pending bracket if the user is mid-drag. (Peak detection happens
    // earlier, inside the FFT block, so it can use threshold-gated data.)
    const drawIsoBracket = (isoMin: number, isoMax: number, opts: { label?: string; pending?: boolean }) => {
      const lx = freqToX(Math.max(minF, isoMin), w, minF, maxF);
      const rx = freqToX(Math.min(maxF, isoMax), w, minF, maxF);
      ctx.fillStyle = opts.pending ? 'rgba(168, 85, 247, 0.18)' : 'rgba(168, 85, 247, 0.10)';
      ctx.fillRect(lx, 0, rx - lx, h - 20);

      ctx.strokeStyle = opts.pending ? 'rgba(168, 85, 247, 0.7)' : 'rgba(168, 85, 247, 0.9)';
      ctx.lineWidth = 2;
      if (opts.pending) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h - 20);
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx, h - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!opts.pending) {
        // Grab tabs near the bottom of each locator
        ctx.fillStyle = '#a855f7';
        const handleY = h - 26;
        ctx.fillRect(lx - 4, handleY, 8, 12);
        ctx.fillRect(rx - 4, handleY, 8, 12);
      }

      // Frequency labels at the top of each locator
      ctx.fillStyle = 'rgba(168, 85, 247, 0.95)';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(isoMin)}`, lx, 10);
      ctx.fillText(`${Math.round(isoMax)}`, rx, 10);

      if (opts.label) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(opts.label, (lx + rx) / 2, 10);
      }
    };

    for (let i = 0; i < isolationsRef.current.length; i++) {
      const iso = isolationsRef.current[i];
      drawIsoBracket(iso.minFreq, iso.maxFreq, {
        label: isolationsRef.current.length > 1 ? `${i + 1}` : undefined,
      });
    }

    // In-progress drag rectangle
    const pending = pendingIsoRef.current;
    if (pending) {
      const lo = Math.min(pending.startFreq, pending.currentFreq);
      const hi = Math.max(pending.startFreq, pending.currentFreq);
      drawIsoBracket(lo, hi, { pending: true });
    }

    // Hover readout — vertical guide line + freq/note label that follows
    // the cursor while the mouse is inside the canvas (and not dragging).
    const hover = hoverRef.current;
    if (hover && !dragStateRef.current.type) {
      const hx = Math.max(0, Math.min(w, hover.x));
      const hoverFreq = xToFreq(hx, w, minF, maxF);
      if (hoverFreq >= MIN_FREQ && hoverFreq <= MAX_FREQ) {
        const note = frequencyToNote(hoverFreq, refFreq);
        const displayNote = getDisplayName(note.name, currentNaming);
        const centsRounded = Math.round(note.centsOff);
        const centsStr = centsRounded >= 0 ? `+${centsRounded}` : `${centsRounded}`;

        // Guide line (thin, dim, sits behind everything except the iso marks)
        ctx.strokeStyle = 'rgba(245, 245, 250, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, h - 20);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label content
        const label1 = `${displayNote}${note.octave} ${centsStr}¢`;
        const label2 = `${hoverFreq.toFixed(1)} Hz`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw1 = ctx.measureText(label1).width;
        ctx.font = '9px "JetBrains Mono", monospace';
        const tw2 = ctx.measureText(label2).width;
        const labelW = Math.max(tw1, tw2) + 10;
        const labelH = 28;
        // Flip the label to the other side of the guide line when we're
        // near the right edge so it never clips.
        const flip = hx + labelW + 6 > w;
        const labelX = flip ? hx - labelW - 6 : hx + 6;
        const labelY = 4;

        ctx.fillStyle = 'rgba(15, 15, 25, 0.88)';
        ctx.strokeStyle = 'rgba(245, 245, 250, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(245, 245, 250, 0.95)';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label1, labelX + labelW / 2, labelY + 11);
        ctx.fillStyle = 'rgba(180, 180, 200, 0.75)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(label2, labelX + labelW / 2, labelY + 22);
      }
    }

    // Range info
    ctx.fillStyle = '#A1A1A1';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${formatFreq(minF)} Hz`, 4, 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${formatFreq(maxF)} Hz`, w - 4, 12);

    animRef.current = requestAnimationFrame(draw);
  }, [bands]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  useEffect(() => {
    setAnalyserFftSize(fftSize);
  }, [fftSize]);

  useEffect(() => {
    setAnalyserSmoothing(fftSmoothing);
  }, [fftSmoothing]);

  /** Hit-test: returns which isolation (and which side) is under x, if
   *  the pointer is within `tol` pixels of one of its locator lines. */
  const findIsoHandleAt = useCallback((x: number, w: number, tol = 12) => {
    const [minF, maxF] = viewRange;
    for (const iso of isolations) {
      const lx = freqToX(Math.max(minF, iso.minFreq), w, minF, maxF);
      const rx = freqToX(Math.min(maxF, iso.maxFreq), w, minF, maxF);
      const dL = Math.abs(x - lx);
      const dR = Math.abs(x - rx);
      if (dL <= tol && dL <= dR) return { iso, side: 'left' as const };
      if (dR <= tol) return { iso, side: 'right' as const };
    }
    return null;
  }, [viewRange, isolations]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = rect.height;
    const w = rect.width;

    // 1. Existing isolation handles (highest priority — most visually obvious)
    const hit = findIsoHandleAt(x, w);
    if (hit) {
      setDragState({
        type: hit.side === 'left' ? 'iso-resize-left' : 'iso-resize-right',
        startX: e.clientX,
        startY: e.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: hit.iso.id,
        startIsoMin: hit.iso.minFreq,
        startIsoMax: hit.iso.maxFreq,
        startFreq: 0,
      });
      return;
    }

    // 2. Threshold line
    const threshY = dbToY(threshold, h - 20, DB_FLOOR, DB_CEIL);
    if (Math.abs(y - threshY) < 10) {
      setDragState({
        type: 'threshold',
        startX: e.clientX,
        startY: e.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: null,
        startIsoMin: 0,
        startIsoMax: 0,
        startFreq: 0,
      });
      return;
    }

    // 3. Modifier decides: shift+drag = create iso, plain drag = pan.
    //    (Cap-aware: if we're already at MAX_ISOLATIONS, even shift falls
    //    back to pan so the user isn't stuck.)
    const [minF, maxF] = viewRange;
    const startFreq = xToFreq(x, w, minF, maxF);
    const wantIso = e.shiftKey && isolations.length < MAX_ISOLATIONS;
    setDragState({
      type: wantIso ? 'iso-create' : 'pan',
      startX: e.clientX,
      startY: e.clientY,
      startThreshold: threshold,
      startRange: viewRange,
      isoId: null,
      startIsoMin: 0,
      startIsoMax: 0,
      startFreq,
    });
    if (wantIso) {
      // Seed the pending bracket at zero width so it appears under the
      // cursor straight away; mouseMove fattens it up.
      setPendingIso({ startFreq, currentFreq: startFreq });
    }
  }, [viewRange, threshold, findIsoHandleAt, isolations.length]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Always update hover position so the readout label tracks the cursor.
    hoverRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    if (!dragState.type) return;

    const [minF, maxF] = viewRange;

    if (dragState.type === 'threshold') {
      const dy = e.clientY - dragState.startY;
      const dbRange = DB_CEIL - DB_FLOOR;
      const dbDelta = -(dy / (rect.height - 20)) * dbRange;
      setThreshold(Math.max(-90, Math.min(-10, Math.round(dragState.startThreshold + dbDelta))));
    } else if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') {
      const x = e.clientX - rect.left;
      const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
      const update = useTunerStore.getState().updateIsolationRange;
      if (!dragState.isoId) return;
      if (dragState.type === 'iso-resize-left') {
        // Keep min < max with a minimum 5 Hz window
        update(dragState.isoId, Math.min(newFreq, dragState.startIsoMax - 5), dragState.startIsoMax);
      } else {
        update(dragState.isoId, dragState.startIsoMin, Math.max(newFreq, dragState.startIsoMin + 5));
      }
    } else if (dragState.type === 'pan') {
      const dx = e.clientX - dragState.startX;
      if (Math.abs(dx) < 1) return;
      const [sMin, sMax] = dragState.startRange;
      const logMin = Math.log10(sMin);
      const logMax = Math.log10(sMax);
      const logSpan = logMax - logMin;
      const shift = -(dx / rect.width) * logSpan;
      let newLogMin = logMin + shift;
      let newLogMax = logMax + shift;
      // Clamp to the absolute bounds without changing the span (so panning
      // past the edge "sticks" instead of zooming).
      if (newLogMin < Math.log10(MIN_FREQ)) {
        newLogMax += Math.log10(MIN_FREQ) - newLogMin;
        newLogMin = Math.log10(MIN_FREQ);
      }
      if (newLogMax > Math.log10(MAX_FREQ)) {
        newLogMin -= newLogMax - Math.log10(MAX_FREQ);
        newLogMax = Math.log10(MAX_FREQ);
      }
      setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
    } else if (dragState.type === 'iso-create') {
      const x = e.clientX - rect.left;
      const currentFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
      setPendingIso((p) => (p ? { ...p, currentFreq } : { startFreq: dragState.startFreq, currentFreq }));
    }
  }, [dragState, viewRange]);

  const handleMouseUp = useCallback(() => {
    if (dragState.type === 'iso-create') {
      const p = pendingIsoRef.current;
      if (p) {
        const lo = Math.min(p.startFreq, p.currentFreq);
        const hi = Math.max(p.startFreq, p.currentFreq);
        // Reject pinprick drags (< 5 Hz wide) so a shift-click doesn't
        // create a useless one-bin window.
        if (hi - lo >= 5) {
          useTunerStore.getState().addIsolation(lo, hi);
        }
      }
      setPendingIso(null);
    }
    setDragState((s) => ({ ...s, type: null }));
  }, [dragState]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;

    // Right-click on an isolation handle removes that isolation.
    const hit = findIsoHandleAt(x, w, 14);
    if (hit) {
      useTunerStore.getState().removeIsolation(hit.iso.id);
    }
  }, [findIsoHandleAt]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const [minF, maxF] = viewRange;

    const centerFreq = xToFreq(mouseX, rect.width, minF, maxF);
    const logCenter = Math.log10(centerFreq);
    const logMin = Math.log10(minF);
    const logMax = Math.log10(maxF);
    const logSpan = logMax - logMin;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newSpan = Math.max(MIN_LOG_SPAN, Math.min(MAX_LOG_SPAN, logSpan * zoomFactor));

    const ratio = (logCenter - logMin) / logSpan;
    let newLogMin = logCenter - ratio * newSpan;
    let newLogMax = logCenter + (1 - ratio) * newSpan;

    newLogMin = Math.max(Math.log10(MIN_FREQ), newLogMin);
    newLogMax = Math.min(Math.log10(MAX_FREQ), newLogMax);

    setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
  }, [viewRange]);

  // ── Pinch-to-zoom (mobile) ──────────────────────────────────────────
  const pinchRef = useRef<{ startDist: number; startRange: [number, number]; centerFreq: number } | null>(null);
  // Long-press timer — fires after TOUCH_HOLD_MS of a stationary single
  // finger to promote a pending touch from 'pan' to 'iso-create'.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const touchDistance = (touches: React.TouchList) =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const [minF, maxF] = viewRange;

    if (e.touches.length === 2) {
      cancelLongPress();
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      pinchRef.current = {
        startDist: touchDistance(e.touches),
        startRange: [minF, maxF],
        centerFreq: xToFreq(midX, rect.width, minF, maxF),
      };
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;

      // Iso handle resize wins
      const hit = findIsoHandleAt(x, w, 18);
      if (hit) {
        e.preventDefault();
        setDragState({
          type: hit.side === 'left' ? 'iso-resize-left' : 'iso-resize-right',
          startX: t.clientX,
          startY: t.clientY,
          startThreshold: threshold,
          startRange: viewRange,
          isoId: hit.iso.id,
          startIsoMin: hit.iso.minFreq,
          startIsoMax: hit.iso.maxFreq,
          startFreq: 0,
        });
        return;
      }

      // Threshold line — same hit zone as the mouse path. Wider on touch
      // (16px vs the mouse's 10px) since fingers are less precise.
      const threshY = dbToY(threshold, h - 20, DB_FLOOR, DB_CEIL);
      if (Math.abs(y - threshY) < 16) {
        e.preventDefault();
        setDragState({
          type: 'threshold',
          startX: t.clientX,
          startY: t.clientY,
          startThreshold: threshold,
          startRange: viewRange,
          isoId: null,
          startIsoMin: 0,
          startIsoMax: 0,
          startFreq: 0,
        });
        return;
      }

      // Empty area → start panning immediately. A long-press timer runs
      // in parallel: if the finger sits still long enough, we promote
      // pan→iso-create (touch-hold-then-drag gesture).
      const startFreq = xToFreq(x, w, minF, maxF);
      setDragState({
        type: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        startThreshold: threshold,
        startRange: viewRange,
        isoId: null,
        startIsoMin: 0,
        startIsoMax: 0,
        startFreq,
      });
      cancelLongPress();
      if (isolations.length < MAX_ISOLATIONS) {
        longPressTimerRef.current = setTimeout(() => {
          // Only promote if we're still in 'pan' (finger never moved much)
          // and the cap still has room.
          const ds = dragStateRef.current;
          if (ds.type !== 'pan') return;
          if (useTunerStore.getState().isolations.length >= MAX_ISOLATIONS) return;
          setPendingIso({ startFreq, currentFreq: startFreq });
          setDragState((s) => ({ ...s, type: 'iso-create' }));
        }, TOUCH_HOLD_MS);
      }
    }
  }, [viewRange, threshold, findIsoHandleAt, isolations.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 2-finger pinch (zoom) takes precedence
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      if (dist <= 0) return;
      const ratioChange = pinchRef.current.startDist / dist;
      const [sMin, sMax] = pinchRef.current.startRange;
      const logMin = Math.log10(sMin);
      const logMax = Math.log10(sMax);
      const logSpan = logMax - logMin;
      const logCenter = Math.log10(pinchRef.current.centerFreq);
      const newSpan = Math.max(MIN_LOG_SPAN, Math.min(MAX_LOG_SPAN, logSpan * ratioChange));
      const centerRatio = (logCenter - logMin) / logSpan;
      let newLogMin = logCenter - centerRatio * newSpan;
      let newLogMax = logCenter + (1 - centerRatio) * newSpan;
      newLogMin = Math.max(Math.log10(MIN_FREQ), newLogMin);
      newLogMax = Math.min(Math.log10(MAX_FREQ), newLogMax);
      setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
      return;
    }

    // 1-finger drag
    if (e.touches.length === 1 && dragState.type) {
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const [minF, maxF] = viewRange;

      // Cancel the long-press as soon as the finger has moved enough.
      const moved = Math.abs(t.clientX - dragState.startX) + Math.abs(t.clientY - dragState.startY);
      if (moved > DRAG_THRESHOLD_PX) cancelLongPress();

      if (dragState.type === 'threshold') {
        e.preventDefault();
        const dy = t.clientY - dragState.startY;
        const dbRange = DB_CEIL - DB_FLOOR;
        const dbDelta = -(dy / (rect.height - 20)) * dbRange;
        setThreshold(Math.max(-90, Math.min(-10, Math.round(dragState.startThreshold + dbDelta))));
      } else if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') {
        e.preventDefault();
        const x = t.clientX - rect.left;
        const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
        const update = useTunerStore.getState().updateIsolationRange;
        if (!dragState.isoId) return;
        if (dragState.type === 'iso-resize-left') {
          update(dragState.isoId, Math.min(newFreq, dragState.startIsoMax - 5), dragState.startIsoMax);
        } else {
          update(dragState.isoId, dragState.startIsoMin, Math.max(newFreq, dragState.startIsoMin + 5));
        }
      } else if (dragState.type === 'pan') {
        e.preventDefault();
        const dx = t.clientX - dragState.startX;
        const [sMin, sMax] = dragState.startRange;
        const logMin = Math.log10(sMin);
        const logMax = Math.log10(sMax);
        const logSpan = logMax - logMin;
        const shift = -(dx / rect.width) * logSpan;
        let newLogMin = logMin + shift;
        let newLogMax = logMax + shift;
        if (newLogMin < Math.log10(MIN_FREQ)) {
          newLogMax += Math.log10(MIN_FREQ) - newLogMin;
          newLogMin = Math.log10(MIN_FREQ);
        }
        if (newLogMax > Math.log10(MAX_FREQ)) {
          newLogMin -= newLogMax - Math.log10(MAX_FREQ);
          newLogMax = Math.log10(MAX_FREQ);
        }
        setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
      } else if (dragState.type === 'iso-create') {
        e.preventDefault();
        const x = t.clientX - rect.left;
        const currentFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
        setPendingIso((p) => (p ? { ...p, currentFreq } : { startFreq: dragState.startFreq, currentFreq }));
      }
    }
  }, [dragState, viewRange]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;

    if (e.touches.length === 0) {
      cancelLongPress();
      if (dragState.type === 'iso-create') {
        const p = pendingIsoRef.current;
        if (p) {
          const lo = Math.min(p.startFreq, p.currentFreq);
          const hi = Math.max(p.startFreq, p.currentFreq);
          if (hi - lo >= 5) useTunerStore.getState().addIsolation(lo, hi);
        }
        setPendingIso(null);
      }
      setDragState((s) => ({ ...s, type: null }));
    }
  }, [dragState]);

  const handleDoubleClick = useCallback(() => {
    setViewRange([MIN_FREQ, MAX_FREQ]);
  }, []);

  const getCursor = () => {
    if (dragState.type === 'threshold') return 'ns-resize';
    if (dragState.type === 'iso-resize-left' || dragState.type === 'iso-resize-right') return 'ew-resize';
    if (dragState.type === 'iso-create') return 'crosshair';
    if (dragState.type === 'pan') return 'grabbing';
    return 'crosshair';
  };

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ borderTop: '1px solid var(--border)' }}
      data-spectrum-analyser
    >
      {/* Single-row header: title + inline smooth slider + clear-iso + close.
          Everything is text-[10px]/min-w-0 so it stays on one line at narrow
          widths instead of wrapping. */}
      <div
        className="flex items-center gap-2 px-2 py-1 min-w-0"
        style={{ background: 'var(--bg-panel)' }}
      >
        <span
          className="text-[10px] font-medium whitespace-nowrap"
          style={{ color: 'var(--accent-blue)' }}
        >
          SPECTRUM ANALYSER
        </span>
        <label
          className="flex items-center gap-1.5 text-[9px] flex-1 min-w-0"
          style={{ color: 'var(--text-dim)' }}
        >
          <span className="whitespace-nowrap">SMOOTH</span>
          <input
            type="range"
            min="0"
            max="0.99"
            step="0.01"
            value={fftSmoothing}
            onChange={(e) => useTunerStore.getState().setFftSmoothing(parseFloat(e.target.value))}
            className="flex-1 h-1 min-w-0"
            style={{ accentColor: 'var(--accent-blue)' }}
          />
          <span className="tabular-nums w-7 text-right" style={{ color: 'var(--text-secondary)' }}>
            {Math.round(fftSmoothing * 100)}%
          </span>
        </label>
        {isolations.length > 0 && (
          <button
            onClick={() => useTunerStore.getState().clearIsolations()}
            className="text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
            style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.15)' }}
          >
            Clear iso
          </button>
        )}
        <button
          onClick={() => useTunerStore.getState().setShowSpectrum(false)}
          className="text-xs px-1.5 py-0.5 rounded shrink-0"
          style={{ color: 'var(--text-dim)', background: 'var(--bg-tertiary)' }}
          aria-label="Hide spectrum analyser"
        >
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        data-tour="spectrum-canvas"
        className="w-full h-[120px] lg:h-[140px]"
        style={{ cursor: getCursor(), touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          hoverRef.current = null;
          setDragState((s) => ({ ...s, type: null }));
        }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />
    </div>
  );
}
