import { useEffect, useRef } from 'react';
import { useTunerStore, ISO_COLORS, type IsolationWindow } from '../store/tunerStore';
import { frequencyToNote, getDisplayName } from '../utils/notes';
import { getAudioContext } from '../audio/AudioEngine';
import { micLiveness, mixRgba } from './bgSignal';

// Must match the analysis hop in public/audio-worklet-processor.js so the
// isolation band's strobe motion uses the exact same phase-rate physics as
// the main strobe bands (which read phaseDelta straight from the worklet).
const HOP_SIZE = 512;

/**
 * Row of strobe-style tuning bands, one per active spectrum-analyser
 * isolation window. With one isolation the band fills the full width; with
 * two they share 50/50. Each band reads its window's loudest-peak
 * frequency from the store and renders exactly like the main strobe
 * bands: colour by tolerance, cents readout on the right, sliding bars
 * driven by detuning from the nearest 12-TET semitone.
 */
export function IsolationBand() {
  const isolations = useTunerStore((s) => s.isolations);
  if (isolations.length === 0) return null;

  return (
    <div
      className="shrink-0 flex"
      style={{ borderTop: '2px solid var(--border)' }}
    >
      {isolations.map((iso, idx) => (
        <div
          key={iso.id}
          className="flex-1 min-w-0 flex flex-col"
          style={{
            // Neutral separator between bandlets — each band's own colour
            // (teal / purple) comes from its ISO label + accent below.
            borderLeft: idx > 0 ? '1px solid var(--border)' : 'none',
          }}
        >
          <IsolationBandItem iso={iso} index={idx + 1} total={isolations.length} />
        </div>
      ))}
    </div>
  );
}

/** A single isolation's strobe band — owns its own canvas + rAF loop. */
function IsolationBandItem({
  iso,
  index,
  total,
}: {
  iso: IsolationWindow;
  index: number;
  total: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const accumulatedPhaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      // Pull live values via store.getState() each frame to avoid extra renders.
      const state = useTunerStore.getState();
      const currentIso = state.isolations.find((i) => i.id === iso.id);
      // If this isolation was removed mid-frame, just bail — the parent
      // will unmount us on the next React pass.
      if (!currentIso) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      const peakFreq = currentIso.peakFreq;
      const tolNow = state.tolerance;
      const hyst = state.inTuneHysteresis;
      const speed = state.strobeSpeed;
      const intensity = state.strobeIntensity;
      const softness = state.strobeSoftness;
      const refFreq = state.referenceFreq;
      const naming = state.noteNaming;

      // Resolve nearest 12-TET note + cents detuning from the peak frequency
      let nearestLabel = '—';
      let cents = 0;
      let nearestNoteFreq = 0; // exact ET freq of the nearest note (strobe target)
      let active = false;
      if (peakFreq !== null && peakFreq > 0) {
        const note = frequencyToNote(peakFreq, refFreq);
        nearestLabel = `${getDisplayName(note.name, naming)}${note.octave}`;
        cents = note.centsOff;
        nearestNoteFreq = note.frequency;
        active = true;
      }

      const absCents = Math.abs(cents);
      // Hysteresis: once green, must drift past tol + hyst to flip red.
      const isInTune = active && absCents < tolNow + (absCents < tolNow ? hyst : 0);
      const colorHue = isInTune ? 140 : 0;
      const colorSat = isInTune ? 100 : 90;
      const colorLight = isInTune ? 55 : 50;

      // Theme-aware neutrals that darken with the mic (in sync with the strobe
      // via micLiveness): light grey resting → dark when signal is present.
      const dark = state.theme === 'dark';
      const d = micLiveness.value;
      const PAL = {
        bg:       dark ? mixRgba([26, 26, 35, 0.98], [16, 16, 22, 0.98], d)      : mixRgba([212, 215, 221, 0.98], [22, 22, 30, 0.98], d),
        labelOn:  dark ? 'rgba(245, 245, 250, 0.95)'                             : mixRgba([25, 27, 36, 0.9], [242, 242, 248, 0.95], d),
        labelOff: dark ? 'rgba(200, 200, 215, 0.45)'                            : mixRgba([30, 32, 42, 0.6], [200, 200, 215, 0.55], d),
        noPeak:   dark ? 'rgba(180, 180, 200, 0.5)'                             : mixRgba([30, 32, 42, 0.55], [180, 180, 200, 0.5], d),
        centsOut: 'rgba(190, 190, 205, 0.95)',
        hzOff:    'rgba(120, 122, 140, 0.85)',
      };

      // Background — resting neutral, like the strobe bands
      ctx.fillStyle = PAL.bg;
      ctx.fillRect(0, 0, w, h);

      // Phase animation — IDENTICAL physics to the main strobe bands.
      // The main bands advance by the worklet's measured phase rate:
      //   phaseDelta = 2π · (signalHz − targetHz) · hopSize / sampleRate
      //   phase += phaseDelta · 0.5 · strobeSpeed   (per frame)
      // We reproduce that here from the isolation peak's Hz error against
      // its nearest ET note. This makes the bar motion (a) scale with the
      // real Hz detuning so it speeds up the further out of tune you are,
      // (b) be frequency-aware (a given cents error drifts faster at high
      // notes than low), and (c) run frame-based like the main strobe —
      // replacing the old frequency-independent cents·0.05·dt proxy that
      // read slow and barely changed with sharpness/flatness.
      const sampleRate = getAudioContext()?.sampleRate ?? 44100;
      if (active && peakFreq !== null) {
        const freqError = peakFreq - nearestNoteFreq;
        const phaseDelta = (2 * Math.PI * freqError * HOP_SIZE) / sampleRate;
        accumulatedPhaseRef.current += phaseDelta * 0.5 * speed;
      }
      const phase = accumulatedPhaseRef.current;

      // Sliding bars
      if (active) {
        const barCount = Math.max(3, Math.round((peakFreq ?? 100) / 80));
        const barWidth = w / barCount;
        const bw = barWidth * 0.5;
        ctx.fillStyle = `hsla(${colorHue}, ${colorSat}%, ${colorLight}%, ${Math.min(1, intensity)})`;

        const FADE_RANGE = 50;
        const minSoft = Math.min(0.05, softness);
        const fadeT = Math.max(0, Math.min(1, (absCents - tolNow) / FADE_RANGE));
        const effectiveSoft = minSoft + (softness - minSoft) * fadeT;
        const blurPx = effectiveSoft * Math.min(10, barWidth * 0.25);

        if (blurPx > 0.1) ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
        for (let j = -2; j < barCount + 2; j++) {
          const x = j * barWidth + ((phase * barWidth) / (2 * Math.PI)) % barWidth;
          ctx.fillRect(x - bw / 2, 4, bw, h - 8);
        }
        if (blurPx > 0.1) ctx.filter = 'none';
      }

      // Label — nearest note (left). Scale font down when two bandlets
      // share the row so the label still fits.
      ctx.fillStyle = active ? PAL.labelOn : PAL.labelOff;
      const labelSize = Math.min(total > 1 ? 30 : 40, Math.max(20, h * (total > 1 ? 0.4 : 0.5)));
      ctx.font = `bold ${labelSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(nearestLabel, 10, h / 2 - labelSize * 0.15);

      // Peak Hz under the note label
      const hzFontSize = w < 500 ? 12 : 14;
      ctx.fillStyle = PAL.noPeak;
      ctx.font = `${hzFontSize}px "JetBrains Mono", monospace`;
      ctx.fillText(
        peakFreq !== null ? `${peakFreq.toFixed(1)} Hz` : 'no peak in window',
        10,
        h / 2 + labelSize * 0.4 + 4,
      );

      // Cents readout (right)
      if (active) {
        const cs = Math.min(total > 1 ? 28 : 38, Math.max(20, h * (total > 1 ? 0.38 : 0.45)));
        const sign = cents >= 0 ? '+' : '';
        ctx.font = `bold ${cs}px "JetBrains Mono", monospace`;
        // White when in tune so the digits stay legible over the green bar.
        ctx.fillStyle = isInTune ? '#ffffff' : PAL.centsOut;
        ctx.textAlign = 'right';
        ctx.fillText(`${sign}${Math.round(cents)}`, w - 10, h / 2 - cs * 0.2);

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = PAL.hzOff;
        ctx.fillText('¢', w - 10, h / 2 + cs * 0.55);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [iso.id, total]);

  // This window's colour slot (teal = 1st, purple = 2nd) — drives the
  // header accent, ISO label, and remove button so it visibly matches its
  // bracket on the spectrum above.
  const color = ISO_COLORS[iso.colorIndex] ?? ISO_COLORS[0];

  return (
    <>
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{
          background: 'var(--bg-panel)',
          borderLeft: `3px solid ${color.hex}`,
        }}
      >
        <span className="text-[10px] font-semibold tracking-wider" style={{ color: color.hex }}>
          ISO {total > 1 ? `· ${index}/${total}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
            {Math.round(iso.minFreq)}–{Math.round(iso.maxFreq)} Hz
          </span>
          <button
            onClick={() => useTunerStore.getState().removeIsolation(iso.id)}
            className="text-[10px] leading-none px-1.5 py-0.5 rounded"
            style={{
              color: color.hex,
              background: `rgba(${color.rgb}, 0.15)`,
              border: `1px solid rgba(${color.rgb}, 0.4)`,
            }}
            aria-label="Remove this isolation"
            title="Remove this isolation"
          >
            ✕
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-[80px] lg:h-[110px]"
        style={{ display: 'block' }}
      />
    </>
  );
}
