import { useRef, useEffect, useCallback } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { getDisplayName } from '../utils/notes';
import { playTone, stopTone, playBeep } from '../audio/PitchPipe';
import { micLiveness, mixRgba, type Rgba } from './bgSignal';

// How long the colour + cents readout stays on screen after signal drops
const HOLD_MS = 3500;

// Width of the clickable ♪ pitch-pipe icon strip on the left of each band.
// Clicks inside this region cycle the band's pitch pipe (off → tone → beep);
// clicks outside it behave as before (select / drag the band).
const PIPE_ICON_W = 36;

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
  // Eased 0..1 "locked" amount per band — fades the dark-green background
  // wash in/out. Driven by the debounced isInTune state (not raw cents), so
  // it never flickers; the easing just makes the green fade smoothly.
  const smoothedGreenRef = useRef<Map<string, number>>(new Map());
  // Eased 0..1 "gap-fill" amount — how far the live signal has decayed from
  // its peak. Brightens the dark-green gaps toward the bar colour as a note
  // rings down. Smoothed so the live amplitude's frame jitter doesn't flicker.
  const smoothedFillRef = useRef<Map<string, number>>(new Map());
  const readoutCentsRef = useRef<Map<string, number>>(new Map());
  // Global 0..1 "how live is the mic" value, eased, driving the resting→active
  // background darkening. 0 = quiet (light-grey resting bg), 1 = signal present
  // (dark bg for strobe contrast). Fed by the previous frame's loudest band.
  const bgDarkRef = useRef(0);
  const frameMaxAmpRef = useRef(0);
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
  // Long-press drag-to-reorder. Only non-foundation bands can drag.
  const LONG_PRESS_MS = 350;
  const dragRef = useRef<{ fromIndex: number; currentY: number; active: boolean; canDrag: boolean }>({
    fromIndex: -1,
    currentY: 0,
    active: false,
    canDrag: false,
  });
  const dragStartYRef = useRef(0);
  const longPressTimerRef = useRef<number | null>(null);
  // Tracks a pointer-down inside the ♪ icon strip so pointer-up knows to
  // treat the gesture as an icon tap (cycle pipe mode) rather than a
  // band-select / drag.
  const iconPressRef = useRef<{ bandIdx: number; bandId: string } | null>(null);

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const state = useTunerStore.getState();
    const idx = getBandIndexAtY(y, rect.height, state.bands.length);
    if (idx === -1) return;
    const band = state.bands[idx];

    // Left-edge ♪ icon: record the press and bail out so the band-drag /
    // band-select code path is skipped entirely. Pointer-up will cycle
    // the pipe mode if the pointer is still over the icon.
    if (x < PIPE_ICON_W) {
      iconPressRef.current = { bandIdx: idx, bandId: band.id };
      dragRef.current = { fromIndex: -1, currentY: 0, active: false, canDrag: false };
      return;
    }

    const canDrag = !band.isFoundation;
    dragRef.current = { fromIndex: idx, currentY: y, active: false, canDrag };
    dragStartYRef.current = y;

    if (canDrag) {
      // Capture so we keep receiving moves even if pointer leaves the canvas
      canvas.setPointerCapture(e.pointerId);
      cancelLongPress();
      longPressTimerRef.current = window.setTimeout(() => {
        // Promote to active drag after the hold delay
        if (dragRef.current.fromIndex === idx) {
          dragRef.current.active = true;
          // Tiny haptic on supported devices
          if (navigator.vibrate) navigator.vibrate(10);
        }
        longPressTimerRef.current = null;
      }, LONG_PRESS_MS);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.fromIndex === -1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    // If the user moves too far before long-press fires, cancel it
    // (treat as a swipe/scroll rather than a hold).
    if (!dragRef.current.active && Math.abs(y - dragStartYRef.current) > 12) {
      cancelLongPress();
      dragRef.current.fromIndex = -1;
      return;
    }
    dragRef.current.currentY = y;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelLongPress();
    const canvas = canvasRef.current;
    if (!canvas) {
      dragRef.current = { fromIndex: -1, currentY: 0, active: false, canDrag: false };
      iconPressRef.current = null;
      return;
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const state = useTunerStore.getState();

    // ♪ icon tap — only fire if the pointer is still over the same band's
    // icon region. Stops a drag-onto-icon from accidentally toggling pipe.
    if (iconPressRef.current) {
      const press = iconPressRef.current;
      iconPressRef.current = null;
      const stillInIcon = x < PIPE_ICON_W;
      const sameBand = getBandIndexAtY(y, rect.height, state.bands.length) === press.bandIdx;
      if (stillInIcon && sameBand) {
        state.cyclePipeBand(press.bandId);
      }
      return;
    }

    if (dragRef.current.active) {
      const toIndex = getBandIndexAtY(y, rect.height, state.bands.length);
      const fromBand = state.bands[dragRef.current.fromIndex];
      const toBand = toIndex !== -1 ? state.bands[toIndex] : null;
      // Both must be non-foundation to swap
      if (toBand && fromBand && !fromBand.isFoundation && !toBand.isFoundation
          && toIndex !== dragRef.current.fromIndex) {
        state.reorderBands(dragRef.current.fromIndex, toIndex);
      }
    } else if (dragRef.current.fromIndex !== -1) {
      // Quick tap → select the band (still allowed for foundation bands)
      const idx = getBandIndexAtY(y, rect.height, state.bands.length);
      if (idx !== -1) {
        state.setSelectedBand(state.bands[idx].id);
      }
    }
    dragRef.current = { fromIndex: -1, currentY: 0, active: false, canDrag: false };
  }, []);

  const handlePointerCancel = useCallback(() => {
    cancelLongPress();
    dragRef.current = { fromIndex: -1, currentY: 0, active: false, canDrag: false };
    iconPressRef.current = null;
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
    const { rmsLevel, tolerance, selectedBandId, noteNaming, displaySmoothing, strobeSpeed, readoutSmoothing, inTuneHysteresis, strobeIntensity, strobeSoftness, pipeBandId, pipeMode } = state;
    const bands = state.bands;
    const numBands = bands.length;

    // Signal-driven background darkening: the display rests at a light grey
    // (light mode) / soft charcoal (dark mode) and darkens toward the dark
    // strobe background as soon as the mic picks up, giving max bar contrast
    // while playing. `d` is eased off the previous frame's loudest band so it
    // glides rather than snaps, and relaxes back to the resting tone when quiet.
    const dark = state.theme === 'dark';
    const targetDark = Math.min(1, frameMaxAmpRef.current * 1.6);
    bgDarkRef.current = bgDarkRef.current * 0.85 + targetDark * 0.15;
    const d = bgDarkRef.current;
    // Publish for the spectrum + isolation canvases so they darken in sync.
    micLiveness.value = d;

    // Resting → active colour pairs. The bars (red/green) and green in-tune
    // wash stay vivid in both themes; only the neutral bg + text interpolate.
    const RB: Rgba = dark ? [26, 26, 35, 0.98] : [212, 215, 221, 0.98];   // resting bg
    const AB: Rgba = dark ? [16, 16, 22, 0.98] : [22, 22, 30, 0.98];      // active bg
    const RL: Rgba = dark ? [200, 200, 215, 0.55] : [30, 32, 42, 0.65];   // resting label
    const AL: Rgba = dark ? [245, 245, 250, 0.95] : [242, 242, 248, 0.95]; // active label
    const RH: Rgba = dark ? [255, 255, 255, 0.5] : [30, 32, 42, 0.5];     // resting hz
    const AH: Rgba = [255, 255, 255, 0.5];                                 // active hz
    const RS: Rgba = dark ? [40, 40, 54, 1] : [150, 152, 162, 0.7];       // resting separator
    const AS: Rgba = dark ? [30, 30, 42, 1] : [42, 42, 56, 0.85];         // active separator
    const PAL = {
      bandBg:    mixRgba(RB, AB, d),
      bandBgSel: mixRgba([RB[0] + 12, RB[1] + 12, RB[2] + 14, RB[3]], [AB[0] + 12, AB[1] + 12, AB[2] + 14, AB[3]], d),
      label:     mixRgba(RL, AL, d),
      hz:        mixRgba(RH, AH, d),
      sep:       mixRgba(RS, AS, d),
      // Cents + Hz-off only render while a signal is present (dark bg), so
      // they stay light in both themes.
      centsOut:  'rgba(190, 190, 205, 0.95)',
      hzOff:     'rgba(120, 122, 140, 0.85)',
    };

    // Base fill so the 2 px inset around each band slot doesn't reveal the
    // parent background as a stray line above the top / below the bottom band.
    ctx.fillStyle = PAL.bandBg;
    ctx.fillRect(0, 0, w, h);

    let frameMaxAmp = 0;

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
      if (displayedAmp > frameMaxAmp) frameMaxAmp = displayedAmp;
      const barCount = Math.max(3, Math.round(band.frequency / 80));
      const barWidth = w / barCount;

      const centsOff = band.centsDelta;
      const magThreshold = 0.002;

      // Detect signal resuming after a gap > 250ms — treat as a fresh
      // strike and wipe stale state so the previous note's lock can't
      // bleed in on the new one. This rising-edge moment is also the
      // hook for the pitch-pipe beep mode (one beep per strike).
      const prevLastSignal = lastSignalTimeRef.current.get(band.id) ?? -Infinity;
      const isSignalLive = signalPresent && band.magnitude > magThreshold;
      if (isSignalLive && now - prevLastSignal > 250) {
        smoothedCentsRef.current.delete(band.id);
        smoothedGreenRef.current.delete(band.id);
        smoothedFillRef.current.delete(band.id);
        readoutCentsRef.current.delete(band.id);
        medianBufferRef.current.set(band.id, []);
        inTuneStateRef.current.set(band.id, false);
        inTuneChangeStartRef.current.delete(band.id);
        // Pitch-pipe beep mode: fire one reference beep per fresh strike.
        if (pipeBandId === band.id && pipeMode === 'beep') {
          playBeep(band.frequency);
        }
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
      // Bar colour is a clean binary green/red flip driven by the debounced
      // isInTune state — stable, no per-frame flicker on jittery notes.
      const color = isInTune
        ? { h: 140, s: 100, l: 55 }
        : { h: 0, s: 90, l: 50 };
      // Eased "locked" amount for the dark-green background wash. Target is
      // the debounced isInTune (so it can't flicker); the EMA just fades the
      // green in when a note locks and back out when it drifts/decays.
      const GREEN_EASE = 0.85;
      const greenTarget = (signalLive || holdActive) && isInTune ? 1 : 0;
      const prevGreen = smoothedGreenRef.current.get(band.id) ?? greenTarget;
      const greenTint = prevGreen * GREEN_EASE + greenTarget * (1 - GREEN_EASE);
      smoothedGreenRef.current.set(band.id, greenTint);
      // Gap-fill: how far the LIVE signal has decayed from its peak (0 = at
      // peak → dark gaps; 1 = faded → gaps brightened to the bar colour).
      // Tracks live amplitude, which falls faster than the bars' 4s hold, so
      // the strobe pattern melts into a green field as the note rings down.
      const peakAmp = peakAmpRef.current.get(band.id) ?? 0;
      const rawFill = peakAmp > 0.01 ? Math.max(0, Math.min(1, 1 - amplitude / peakAmp)) : 0;
      const FILL_SMOOTH = 0.8;
      const prevFill = smoothedFillRef.current.get(band.id) ?? rawFill;
      const fillT = (signalLive || holdActive) ? prevFill * FILL_SMOOTH + rawFill * (1 - FILL_SMOOTH) : 0;
      smoothedFillRef.current.set(band.id, fillT);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y + 2, w, bandHeight - 4);
      ctx.clip();

      // Black band background — the LinoTune look. The sliding bars supply
      // the bright colour; the background (incl. the gaps between bars) is
      // black when off-pitch and washes toward dark green as the band locks.
      ctx.fillStyle = isSelected ? PAL.bandBgSel : PAL.bandBg;
      ctx.fillRect(0, y + 2, w, bandHeight - 4);
      if (greenTint > 0.01) {
        // Flat green wash over the whole band (incl. the gaps between bars).
        // Starts dark green for contrast against the bright bars, then
        // brightens toward the bar colour as the note rings down (fillT), so
        // the strobe pattern melts into a near-solid green field before the
        // lock finally drops back to red.
        const wh = 150 - 10 * fillT;             // hue 150 → 140 (toward bars)
        const ws = 60 + 35 * fillT;              // saturation 60% → 95%
        const wl = 13 + 24 * fillT;              // lightness 13% → 37% (stays under bar's 55%)
        const wa = greenTint * (0.85 + 0.15 * fillT);
        ctx.fillStyle = `hsla(${wh.toFixed(0)}, ${ws.toFixed(0)}%, ${wl.toFixed(0)}%, ${wa.toFixed(3)})`;
        ctx.fillRect(0, y + 2, w, bandHeight - 4);
      }

      if (displayedAmp > 0.01) {
        // Alternating colored / black rectangles. Each "cycle" is barWidth
        // wide and split 50/50 between a coloured bar and a black gap.
        // Edge blur scales with how far off pitch we are: a slight feather
        // even when locked, ramping to a heavy wash that nearly merges
        // adjacent bars when way out (LinoTune-style). The BLUR slider
        // (strobeSoftness) scales the whole range, so BLUR=0 keeps bars crisp.
        const barAlpha = Math.min(1, displayedAmp * strobeIntensity);
        ctx.fillStyle = `hsla(${color.h}, ${color.s}%, ${color.l}%, ${barAlpha})`;
        const bw = barWidth * 0.5;

        const FADE_RANGE = 60; // cents past tolerance over which blur reaches max
        const fadeT = Math.max(0, Math.min(1, (Math.abs(smoothedCents) - tolerance) / FADE_RANGE));
        const minBlur = Math.min(1.8, barWidth * 0.05) * strobeSoftness; // slight feather in tune
        const maxBlur = Math.min(40, barWidth * 0.6) * strobeSoftness;   // near-merge when way off
        const blurPx = minBlur + (maxBlur - minBlur) * fadeT;

        if (blurPx > 0.1) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
        for (let j = -2; j < barCount + 2; j++) {
          const x = j * barWidth + ((newPhase * barWidth) / (2 * Math.PI)) % barWidth;
          ctx.fillRect(x - bw / 2, y + 4, bw, bandHeight - 8);
        }
        if (blurPx > 0.1) ctx.filter = 'none';

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

      // ♪ Pitch-pipe icon (left edge) — three states per band:
      //   off   → very dim glyph
      //   tone  → solid amber (continuous tone playing)
      //   beep  → solid cyan  (beep-on-strike armed)
      const isPipingThis = pipeBandId === band.id;
      const iconMode: 'off' | 'tone' | 'beep' =
        isPipingThis && pipeMode ? pipeMode : 'off';
      const iconColor =
        iconMode === 'tone'
          ? '#fbbf24'
          : iconMode === 'beep'
            ? '#22d3ee'
            : 'rgba(255, 255, 255, 0.8)';
      const iconSize = Math.min(36, Math.max(24, bandHeight * 0.5));
      ctx.fillStyle = iconColor;
      ctx.font = `${iconSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', PIPE_ICON_W / 2, y + bandHeight / 2);

      // Band note name — shifted right of the icon strip
      const labelColor = isSelected ? '#06b6d4' : PAL.label;
      ctx.fillStyle = labelColor;
      const labelSize = Math.min(56, Math.max(32, bandHeight * 0.7));
      ctx.font = `bold ${labelSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${getDisplayName(band.noteName, noteNaming)}${band.octave}`, PIPE_ICON_W + 6, y + bandHeight / 2 - labelSize * 0.15);

      // Frequency below label — slightly smaller on narrow viewports, with
      // 8px of breathing room between it and the note label above
      const isNarrow = w < 500;
      const hzFontSize = isNarrow ? 13 : 16;
      ctx.fillStyle = PAL.hz;
      ctx.font = `${hzFontSize}px "JetBrains Mono", monospace`;
      ctx.fillText(`${band.frequency.toFixed(1)} Hz`, PIPE_ICON_W + 6, y + bandHeight / 2 + labelSize * 0.35 + 8);

      // Cents deviation on right — show during live signal, or during
      // decay only if we WERE in tune (so a wrong, red reading doesn't
      // linger "locked" on screen between strikes).
      if (signalLive || (holdActive && isInTune)) {
        const roundedCents = Math.round(readoutCents);
        const sign = roundedCents >= 0 ? '+' : '';
        ctx.textAlign = 'right';
        const centsSize = Math.min(44, Math.max(28, bandHeight * 0.5));
        ctx.font = `bold ${centsSize}px "JetBrains Mono", monospace`;
        // Keep cents white when in tune so the digits stay legible on top
        // of the green in-tune bar (green-on-green was unreadable).
        ctx.fillStyle = isInTune ? '#ffffff' : PAL.centsOut;
        ctx.fillText(`${sign}${roundedCents}`, w - 10, y + bandHeight / 2 - centsSize * 0.2);

        // Hz deviation
        const hzOff = band.frequency * (Math.pow(2, readoutCents / 1200) - 1);
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = PAL.hzOff;
        ctx.fillText(`${hzOff >= 0 ? '+' : ''}${hzOff.toFixed(1)} Hz`, w - 10, y + bandHeight / 2 + centsSize * 0.55);
      }

      // Separator — chunky at the foundation boundary, thin between bands
      if (i < numBands - 1) {
        const next = bands[i + 1];
        const isBoundary = !band.isFoundation && next.isFoundation;
        ctx.strokeStyle = isBoundary ? 'rgba(6, 182, 212, 0.55)' : PAL.sep;
        ctx.lineWidth = isBoundary ? 4 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y + bandHeight);
        ctx.lineTo(w, y + bandHeight);
        ctx.stroke();
      }
    }
    // Remember this frame's loudest band so next frame can ease the bg toward
    // its resting/active tone.
    frameMaxAmpRef.current = frameMaxAmp;

    // Drag-active overlay — "lifts" the dragged band visually and shows the
    // drop position with a glowing insert line. Only fires for non-foundation
    // bands (foundation bands never reach the active state).
    if (dragRef.current.active && dragRef.current.fromIndex !== -1) {
      const dragY = startY + dragRef.current.fromIndex * bandHeight;
      const fromBand = bands[dragRef.current.fromIndex];
      const candidateIdx = getBandIndexAtY(dragRef.current.currentY, h, numBands);
      const candidateBand = candidateIdx !== -1 ? bands[candidateIdx] : null;
      const validDrop =
        candidateBand !== null &&
        !candidateBand.isFoundation &&
        candidateIdx !== dragRef.current.fromIndex;

      if (validDrop) {
        const insertY = candidateIdx > dragRef.current.fromIndex
          ? startY + (candidateIdx + 1) * bandHeight
          : startY + candidateIdx * bandHeight;
        // Soft glow
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, insertY);
        ctx.lineTo(w, insertY);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Highlight the band being dragged
      if (fromBand && !fromBand.isFoundation) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.14)';
        ctx.fillRect(0, dragY + 2, w, bandHeight - 4);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, dragY + 3, w - 4, bandHeight - 6);
      }
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ── Pitch-pipe audio driver ─────────────────────────────────────────
  // Subscribe to (pipeBandId, pipeMode) and the freq of *just* the
  // targeted band — NOT the whole `bands` array. The bands array is
  // re-created every audio frame by `updateBands`, so subscribing to it
  // would re-fire this effect 60×/s and constantly cycle the oscillator
  // (and worse, hit playTone's same-freq toggle, which silences it).
  // Beep mode does NOT use playTone — beeps fire from the per-frame
  // onset detector in the draw loop.
  const pipeBandId = useTunerStore((s) => s.pipeBandId);
  const pipeMode = useTunerStore((s) => s.pipeMode);
  const pipeBandFreq = useTunerStore((s) => {
    if (!s.pipeBandId) return null;
    const b = s.bands.find((bb) => bb.id === s.pipeBandId);
    return b?.frequency ?? null;
  });
  useEffect(() => {
    if (!pipeBandId || !pipeMode) {
      stopTone();
      return;
    }
    if (pipeBandFreq === null) {
      // Targeted band no longer exists (e.g. user changed root note).
      useTunerStore.getState().clearPipe();
      stopTone();
      return;
    }
    if (pipeMode === 'tone') {
      playTone(pipeBandFreq);
    } else {
      // beep mode → no continuous tone, beeps fire from the draw loop
      stopTone();
    }
    return () => {
      stopTone();
    };
  }, [pipeBandId, pipeMode, pipeBandFreq]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{
        cursor: dragRef.current.active ? 'grabbing' : 'pointer',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
