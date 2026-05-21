import { useRef, useEffect, useCallback, useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { getAnalyserNode, getAudioContext } from '../audio/AudioEngine';
import { frequencyToNote, getDisplayName } from '../utils/notes';

const MIN_FREQ = 20;
const MAX_FREQ = 16000;
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

interface Marker {
  id: number;
  freq: number;
}

let markerIdCounter = 0;

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dataRef = useRef<Float32Array | null>(null);
  const smoothDataRef = useRef<Float32Array | null>(null);
  const peakHoldRef = useRef<Float32Array | null>(null);

  const bands = useTunerStore((s) => s.bands);

  const [viewRange, setViewRange] = useState<[number, number]>([MIN_FREQ, MAX_FREQ]);
  const [threshold, setThreshold] = useState(-60);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [dragState, setDragState] = useState<{
    type: 'range' | 'threshold' | 'marker' | null;
    startX: number;
    startY: number;
    startRange: [number, number];
    startThreshold: number;
    markerId: number | null;
    markerStartFreq: number;
  }>({ type: null, startX: 0, startY: 0, startRange: [MIN_FREQ, MAX_FREQ], startThreshold: -60, markerId: null, markerStartFreq: 0 });

  const markersRef = useRef(markers);
  markersRef.current = markers;
  const viewRangeRef = useRef(viewRange);
  viewRangeRef.current = viewRange;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

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
    const currentMarkers = markersRef.current;
    const store = useTunerStore.getState();
    const currentNaming = store.noteNaming;
    const refFreq = store.referenceFreq;

    // Background
    ctx.fillStyle = '#08080e';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    for (const gf of gridFreqs) {
      if (gf < minF || gf > maxF) continue;
      const gx = freqToX(gf, w, minF, maxF);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
      ctx.fillStyle = '#33334a';
      ctx.font = '9px "JetBrains Mono", monospace';
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
      ctx.fillStyle = '#33334a';
      ctx.font = '8px "JetBrains Mono", monospace';
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
      // smoothingTimeConstant, so use its output directly
      for (let i = 0; i < binCount; i++) {
        const val = isFinite(raw[i]) ? raw[i] : DB_FLOOR;
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

      ctx.fillStyle = 'rgba(0, 232, 120, 0.7)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${band.noteName}${band.octave}`, bx, 12);
    }

    // User markers
    for (const marker of currentMarkers) {
      if (marker.freq < minF || marker.freq > maxF) continue;
      const mx = freqToX(marker.freq, w, minF, maxF);
      const note = frequencyToNote(marker.freq, refFreq);
      const displayNote = getDisplayName(note.name, currentNaming);
      const centsRounded = Math.round(note.centsOff);
      const centsStr = centsRounded >= 0 ? `+${centsRounded}` : `${centsRounded}`;

      // Marker line
      ctx.strokeStyle = 'rgba(255, 120, 50, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, h - 20);
      ctx.stroke();

      // Diamond handle at top
      ctx.fillStyle = '#ff7832';
      ctx.beginPath();
      ctx.moveTo(mx, 18);
      ctx.lineTo(mx - 5, 24);
      ctx.lineTo(mx, 30);
      ctx.lineTo(mx + 5, 24);
      ctx.closePath();
      ctx.fill();

      // Label background
      const label1 = `${displayNote}${note.octave} ${centsStr}¢`;
      const label2 = `${marker.freq.toFixed(1)} Hz`;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      const tw1 = ctx.measureText(label1).width;
      ctx.font = '9px "JetBrains Mono", monospace';
      const tw2 = ctx.measureText(label2).width;
      const labelW = Math.max(tw1, tw2) + 10;
      const labelX = Math.min(w - labelW - 2, Math.max(2, mx - labelW / 2));

      ctx.fillStyle = 'rgba(30, 20, 10, 0.92)';
      ctx.strokeStyle = 'rgba(255, 120, 50, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(labelX, 32, labelW, 30, 3);
      ctx.fill();
      ctx.stroke();

      // Label text
      ctx.fillStyle = '#ff7832';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label1, labelX + labelW / 2, 45);
      ctx.fillStyle = '#aa6040';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(label2, labelX + labelW / 2, 57);
    }

    // Range info
    ctx.fillStyle = '#555570';
    ctx.font = '9px "JetBrains Mono", monospace';
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

  const findNearestMarker = useCallback((x: number, w: number): Marker | null => {
    const [minF, maxF] = viewRange;
    let closest: Marker | null = null;
    let closestDist = Infinity;
    for (const m of markers) {
      const mx = freqToX(m.freq, w, minF, maxF);
      const dist = Math.abs(mx - x);
      if (dist < closestDist && dist < 15) {
        closest = m;
        closestDist = dist;
      }
    }
    return closest;
  }, [markers, viewRange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = rect.height;
    const w = rect.width;

    // Check if near threshold line
    const threshY = dbToY(threshold, h - 20, DB_FLOOR, DB_CEIL);
    if (Math.abs(y - threshY) < 10) {
      setDragState({
        type: 'threshold',
        startX: e.clientX,
        startY: e.clientY,
        startRange: viewRange,
        startThreshold: threshold,
        markerId: null,
        markerStartFreq: 0,
      });
      return;
    }

    // Check if near an existing marker
    const nearMarker = findNearestMarker(x, w);
    if (nearMarker) {
      setDragState({
        type: 'marker',
        startX: e.clientX,
        startY: e.clientY,
        startRange: viewRange,
        startThreshold: threshold,
        markerId: nearMarker.id,
        markerStartFreq: nearMarker.freq,
      });
      return;
    }

    // Otherwise: place a new marker on click (will confirm on mouseUp if no drag)
    setDragState({
      type: 'range',
      startX: e.clientX,
      startY: e.clientY,
      startRange: [...viewRange],
      startThreshold: threshold,
      markerId: null,
      markerStartFreq: 0,
    });
  }, [viewRange, threshold, findNearestMarker]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState.type) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (dragState.type === 'threshold') {
      const dy = e.clientY - dragState.startY;
      const dbRange = DB_CEIL - DB_FLOOR;
      const dbDelta = -(dy / (rect.height - 20)) * dbRange;
      setThreshold(Math.max(-90, Math.min(-10, Math.round(dragState.startThreshold + dbDelta))));
    } else if (dragState.type === 'marker') {
      const x = e.clientX - rect.left;
      const [minF, maxF] = viewRange;
      const newFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x, rect.width, minF, maxF)));
      setMarkers((prev) => prev.map((m) => m.id === dragState.markerId ? { ...m, freq: newFreq } : m));
    } else if (dragState.type === 'range') {
      const dx = e.clientX - dragState.startX;
      if (Math.abs(dx) < 4) return;
      const [sMin, sMax] = dragState.startRange;
      const logMin = Math.log10(sMin);
      const logMax = Math.log10(sMax);
      const logSpan = logMax - logMin;
      const shift = -(dx / rect.width) * logSpan;
      const newLogMin = Math.max(Math.log10(MIN_FREQ), logMin + shift);
      const newLogMax = Math.min(Math.log10(MAX_FREQ), logMax + shift);
      setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
    }
  }, [dragState, viewRange]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && dragState.type === 'range') {
      const dx = Math.abs(e.clientX - dragState.startX);
      if (dx < 4) {
        // This was a click, not a drag — place a marker
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const [minF, maxF] = viewRange;
        const freq = xToFreq(x, rect.width, minF, maxF);
        if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
          setMarkers((prev) => [...prev, { id: ++markerIdCounter, freq }]);
        }
      }
    }
    setDragState((s) => ({ ...s, type: null }));
  }, [dragState, viewRange]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const nearMarker = findNearestMarker(x, rect.width);
    if (nearMarker) {
      setMarkers((prev) => prev.filter((m) => m.id !== nearMarker.id));
    }
  }, [findNearestMarker]);

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
    const newSpan = Math.max(0.3, Math.min(Math.log10(MAX_FREQ) - Math.log10(MIN_FREQ), logSpan * zoomFactor));

    const ratio = (logCenter - logMin) / logSpan;
    let newLogMin = logCenter - ratio * newSpan;
    let newLogMax = logCenter + (1 - ratio) * newSpan;

    newLogMin = Math.max(Math.log10(MIN_FREQ), newLogMin);
    newLogMax = Math.min(Math.log10(MAX_FREQ), newLogMax);

    setViewRange([Math.pow(10, newLogMin), Math.pow(10, newLogMax)]);
  }, [viewRange]);

  const handleDoubleClick = useCallback(() => {
    setViewRange([MIN_FREQ, MAX_FREQ]);
  }, []);

  const getCursor = () => {
    if (dragState.type === 'threshold') return 'ns-resize';
    if (dragState.type === 'marker') return 'ew-resize';
    if (dragState.type === 'range') return 'grabbing';
    return 'crosshair';
  };

  return (
    <div className="flex flex-col shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-2 py-1" style={{ background: 'var(--bg-panel)' }}>
        <span className="text-[10px] font-medium" style={{ color: 'var(--accent-blue)' }}>SPECTRUM ANALYSER</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
            Click to mark · Drag marker · Right-click to remove · Scroll zoom
          </span>
          {markers.length > 0 && (
            <button
              onClick={() => setMarkers([])}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ color: '#ff7832', background: 'rgba(255, 120, 50, 0.15)' }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => useTunerStore.getState().setShowSpectrum(false)}
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ color: 'var(--text-dim)', background: 'var(--bg-tertiary)' }}
          >
            ✕
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '200px', cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDragState((s) => ({ ...s, type: null }))}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
