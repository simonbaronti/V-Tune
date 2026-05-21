import { useRef, useEffect, useCallback } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { getDisplayName } from '../utils/notes';

// How long the colour + cents readout stays on screen after signal drops
const HOLD_MS = 3500;

function getBandLayout(canvasHeight: number, numBands: number) {
  const bandHeight = canvasHeight / numBands;
  return { bandHeight, totalHeight: canvasHeight, startY: 0 };
}

function getBandIndexAtY(y: number, canvasHeight: number, numBands: number): number {
  const { bandHeight, startY } = getBandLayout(canvasHeight, numBands);
  for (let i = 0; i < numBands; i++) {
    const by = startY + i * bandHeight;
    if (y >= by && y < by + bandHeight) return i;
  }
  return -1;
}

export function StrobeDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const accumulatedPhasesRef = useRef<Map<string, number>>(new Map());
  const smoothedCentsRef = useRef<Map<string, number>>(new Map());
  const readoutCentsRef = useRef<Map<string, number>>(new Map());
  const medianBufferRef = useRef<Map<string, number[]>>(new Map());
  const lastSignalTimeRef = useRef<Map<string, number>>(new Map());
  const inTuneStateRef = useRef<Map<string, boolean>>(new Map());
  // Tracks when the band first "wanted" to change state — debounces flips
  const inTuneChangeStartRef = useRef<Map<string, number>>(new Map());
  // Peak-hold-then-fade envelope per band — bars hold at strike peak then
  // fade out at the tail. Two pieces of state per band: peak amplitude and
  // the time that peak was set.
  const peakAmpRef = useRef<Map<string, number>>(new Map());
  const peakTimeRef = useRef<Map<string, number>>(new Map());
  const dragRef = useRef<{ fromIndex: number; currentY: number; active: boolean }>({
    fromIndex: -1,
    currentY: 0,
    active: false,
  });
  const dragStartYRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const state = useTunerStore.getState();
    const idx = getBandIndexAtY(y, rect.height, state.bands.length);
    if (idx === -1) return;
    dragRef.current = { fromIndex: idx, currentY: y, active: false };
    dragStartYRef.current = y;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current.fromIndex === -1) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (!dragRef.current.active && Math.abs(y - dragStartYRef.current) > 8) {
      dragRef.current.active = true;
    }
    dragRef.current.currentY = y;
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) { dragRef.current = { fromIndex: -1, currentY: 0, active: false }; return; }
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const state = useTunerStore.getState();

    if (dragRef.current.active) {
      const toIndex = getBandIndexAtY(y, rect.height, state.bands.length);
      if (toIndex !== -1 && toIndex !== dragRef.current.fromIndex) {
        state.reorderBands(dragRef.current.fromIndex, toIndex);
      }
    } else {
      const idx = getBandIndexAtY(y, rect.height, state.bands.length);
      if (idx !== -1) {
        state.setSelectedBand(state.bands[idx].id);
      }
    }
    dragRef.current = { fromIndex: -1, currentY: 0, active: false };
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current = { fromIndex: -1, currentY: 0, active: false };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    ctx.clearRect(0, 0, w, h);

    const state = useTunerStore.getState();
    const { rmsLevel, tolerance, selectedBandId, noteNaming, displaySmoothing, strobeSpeed, readoutSmoothing, inTuneHysteresis, strobeIntensity } = state;
    const bands = state.bands;
    const numBands = bands.length;

    if (numBands === 0) {
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const { bandHeight, startY } = getBandLayout(h, numBands);
    const signalPresent = rmsLevel > 0.005;
    const now = performance.now();

    for (let i = 0; i < numBands; i++) {
      const band = bands[i];
      const y = startY + i * bandHeight;
      const isSelected = band.id === selectedBandId;

      if (!accumulatedPhasesRef.current.has(band.id)) {
        accumulatedPhasesRef.current.set(band.id, 0);
      }
      const prevPhase = accumulatedPhasesRef.current.get(band.id)!;
      const newPhase = prevPhase + band.phaseDelta * 0.5 * strobeSpeed;
      accumulatedPhasesRef.current.set(band.id, newPhase);

      const amplitude = Math.min(1, band.magnitude * 50);
      // Peak-hold-then-fade envelope: hold at peak for 4s, then fade
      // linearly to 0 over the next 1s. Any new peak (louder than the
      // current held value) restarts the hold timer.
      const HOLD_DURATION = 4000;
      const FADE_DURATION = 1000;
      const prevPeakAmp = peakAmpRef.current.get(band.id) ?? 0;
      const prevPeakTime = peakTimeRef.current.get(band.id) ?? -Infinity;
      let displayedAmp: number;
      if (amplitude >= prevPeakAmp) {
        // New peak (attack, or louder strike during decay) — reset
        peakAmpRef.current.set(band.id, amplitude);
        peakTimeRef.current.set(band.id, now);
        displayedAmp = amplitude;
      } else {
        const elapsed = now - prevPeakTime;
        if (elapsed < HOLD_DURATION) {
          displayedAmp = prevPeakAmp;
        } else if (elapsed < HOLD_DURATION + FADE_DURATION) {
          const fadeProgress = (elapsed - HOLD_DURATION) / FADE_DURATION;
          displayedAmp = prevPeakAmp * (1 - fadeProgress);
        } else {
          displayedAmp = 0;
          peakAmpRef.current.set(band.id, 0);
        }
        // Never drop below the current live amplitude (e.g. sustained note)
        if (amplitude > displayedAmp) displayedAmp = amplitude;
      }
      const barCount = Math.max(3, Math.round(band.frequency / 80));
      const barWidth = w / barCount;

      const centsOff = band.centsDelta;
      const magThreshold = 0.002;

      // Detect signal resuming after a gap > 250ms — treat as a fresh
      // strike and wipe stale state so the previous note's lock can't
      // bleed in on the new one.
      const prevLastSignal = lastSignalTimeRef.current.get(band.id) ?? -Infinity;
      const isSignalLive = signalPresent && band.magnitude > magThreshold;
      if (isSignalLive && now - prevLastSignal > 250) {
        smoothedCentsRef.current.delete(band.id);
        readoutCentsRef.current.delete(band.id);
        medianBufferRef.current.set(band.id, []);
        inTuneStateRef.current.set(band.id, false);
        inTuneChangeStartRef.current.delete(band.id);
      }

      const prevSmoothed = smoothedCentsRef.current.get(band.id) ?? centsOff;
      const smoothedCents = signalPresent
        ? prevSmoothed * displaySmoothing + centsOff * (1 - displaySmoothing)
        : centsOff;
      smoothedCentsRef.current.set(band.id, smoothedCents);

      // Median filter + EMA for stable readout: only accept readings when
      // magnitude is strong enough, use median of last 7 samples to reject
      // outliers from crosstalk/noise, then EMA on top
      if (!medianBufferRef.current.has(band.id)) {
        medianBufferRef.current.set(band.id, []);
      }
      const buf = medianBufferRef.current.get(band.id)!;
      if (signalPresent && band.magnitude > magThreshold) {
        buf.push(centsOff);
        if (buf.length > 7) buf.shift();
      }
      const medianCents = buf.length > 0
        ? [...buf].sort((a, b) => a - b)[Math.floor(buf.length / 2)]
        : centsOff;
      const prevReadout = readoutCentsRef.current.get(band.id) ?? medianCents;
      const readoutCents = signalPresent && band.magnitude > magThreshold
        ? prevReadout * readoutSmoothing + medianCents * (1 - readoutSmoothing)
        : prevReadout;
      readoutCentsRef.current.set(band.id, readoutCents);

      // Track when the band last had a confident signal — used to hold the
      // colour and cents readout on screen briefly after the note ends.
      if (signalPresent && band.magnitude > magThreshold) {
        lastSignalTimeRef.current.set(band.id, now);
      }
      const lastSignalTime = lastSignalTimeRef.current.get(band.id) ?? -Infinity;
      const holdActive = now - lastSignalTime < HOLD_MS;

      // In-tune decision with debounce + decay freeze:
      // - While the band has confident signal, the cents reading "votes"
      //   for green or red but the state only flips after STABLE_MS of
      //   consistent voting. A brief in-tolerance reading during the
      //   attack transient can't lock green.
      // - Once committed, the state freezes during decay (low magnitude
      //   but recent confident signal) so it doesn't flicker on tail noise.
      // - After HOLD_MS of nothing, drops back to red.
      const STABLE_MS = 100;
      const signalLive = signalPresent && band.magnitude > magThreshold;
      const lastInTune = inTuneStateRef.current.get(band.id) ?? false;
      let isInTune = lastInTune;
      if (signalLive) {
        const absSmoothed = Math.abs(smoothedCents);
        const wantsInTune = lastInTune
          ? absSmoothed < tolerance + inTuneHysteresis
          : absSmoothed < tolerance;
        if (wantsInTune === lastInTune) {
          // Already where we want to be — clear any pending transition
          inTuneChangeStartRef.current.delete(band.id);
        } else {
          // Wants to flip — require STABLE_MS of consistent voting
          const startedAt = inTuneChangeStartRef.current.get(band.id);
          if (startedAt === undefined) {
            inTuneChangeStartRef.current.set(band.id, now);
          } else if (now - startedAt >= STABLE_MS) {
            isInTune = wantsInTune;
            inTuneChangeStartRef.current.delete(band.id);
          }
        }
      } else if (holdActive && lastInTune) {
        // Decaying — only freeze if we WERE genuinely in tune. Locking a
        // false-red state would just preserve a wrong reading.
        isInTune = true;
      } else {
        isInTune = false;
        inTuneChangeStartRef.current.delete(band.id);
      }
      inTuneStateRef.current.set(band.id, isInTune);
      const color = isInTune
        ? { h: 140, s: 100, l: 55 }
        : { h: 0, s: 90, l: 50 };

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y + 2, w, bandHeight - 4);
      ctx.clip();

      // Tinted band background — dark red when out / no signal, lifts to a
      // brighter green panel when within tolerance so "in tune" is unmistakable
      const bgL = isInTune ? 22 : isSelected ? 13 : 10;
      ctx.fillStyle = `hsl(${color.h}, ${color.s}%, ${bgL}%)`;
      ctx.fillRect(0, y + 2, w, bandHeight - 4);

      if (displayedAmp > 0.01) {
        for (let j = -2; j < barCount + 2; j++) {
          const x = j * barWidth + ((newPhase * barWidth) / (2 * Math.PI)) % barWidth;
          const sin = Math.sin((j * Math.PI) / 1 + newPhase);
          const brightness = (sin + 1) / 2;
          const alpha = displayedAmp * brightness * strobeIntensity;

          ctx.fillStyle = `hsla(0, 0%, 92%, ${alpha})`;

          const bw = barWidth * 0.8;
          ctx.fillRect(x - bw / 2, y + 4, bw, bandHeight - 8);
        }

        if (isInTune) {
          const grad = ctx.createLinearGradient(0, y, 0, y + bandHeight);
          grad.addColorStop(0, 'rgba(0, 232, 120, 0)');
          grad.addColorStop(0.5, 'rgba(0, 232, 120, 0.08)');
          grad.addColorStop(1, 'rgba(0, 232, 120, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, y, w, bandHeight);
        }
      }

      ctx.restore();

      // Selected band indicator
      if (isSelected) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(1, y + 2, w - 2, bandHeight - 4);
      }

      // Band note name
      const labelColor = holdActive
        ? 'rgba(245, 245, 250, 0.95)'
        : isSelected ? '#06b6d4' : 'rgba(200, 200, 215, 0.55)';
      ctx.fillStyle = labelColor;
      const labelSize = Math.min(56, Math.max(32, bandHeight * 0.7));
      ctx.font = `bold ${labelSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${getDisplayName(band.noteName, noteNaming)}${band.octave}`, 10, y + bandHeight / 2 - labelSize * 0.15);

      // Frequency below label — slightly smaller on narrow viewports, with
      // 8px of breathing room between it and the note label above
      const isNarrow = w < 500;
      const hzFontSize = isNarrow ? 16 : 20;
      ctx.fillStyle = 'rgba(180, 180, 200, 0.45)';
      ctx.font = `${hzFontSize}px "JetBrains Mono", monospace`;
      ctx.fillText(`${band.frequency.toFixed(1)} Hz`, 10, y + bandHeight / 2 + labelSize * 0.35 + 8);

      // Cents deviation on right — show during live signal, or during
      // decay only if we WERE in tune (so a wrong, red reading doesn't
      // linger "locked" on screen between strikes).
      if (signalLive || (holdActive && isInTune)) {
        const roundedCents = Math.round(readoutCents);
        const sign = roundedCents >= 0 ? '+' : '';
        ctx.textAlign = 'right';
        const centsSize = Math.min(44, Math.max(28, bandHeight * 0.5));
        ctx.font = `bold ${centsSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isInTune ? '#00e878' : '#8888a0';
        ctx.fillText(`${sign}${roundedCents}`, w - 10, y + bandHeight / 2 - centsSize * 0.2);

        // Hz deviation
        const hzOff = band.frequency * (Math.pow(2, readoutCents / 1200) - 1);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#44445a';
        ctx.fillText(`${hzOff >= 0 ? '+' : ''}${hzOff.toFixed(1)} Hz`, w - 10, y + bandHeight / 2 + centsSize * 0.55);
      }

      // Separator
      if (i < numBands - 1) {
        ctx.strokeStyle = '#1e1e2a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + bandHeight);
        ctx.lineTo(w, y + bandHeight);
        ctx.stroke();
      }
    }

    // Drag indicator
    if (dragRef.current.active && dragRef.current.fromIndex !== -1) {
      const toIdx = getBandIndexAtY(dragRef.current.currentY, h, numBands);
      if (toIdx !== -1 && toIdx !== dragRef.current.fromIndex) {
        const insertY = toIdx > dragRef.current.fromIndex
          ? startY + (toIdx + 1) * bandHeight
          : startY + toIdx * bandHeight;
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, insertY);
        ctx.lineTo(w, insertY);
        ctx.stroke();
      }
      // Dim the dragged band
      const dragY = startY + dragRef.current.fromIndex * bandHeight;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.fillRect(0, dragY + 2, w, bandHeight - 4);
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ cursor: dragRef.current.active ? 'grabbing' : 'pointer' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    />
  );
}
