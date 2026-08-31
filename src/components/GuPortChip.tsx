/**
 * The amber "GU PORT" chip under the note grid, in both pickers.
 *
 * Gu-port notes live on the underside of the shell, so they're reference
 * information rather than playable targets — you can't select one the way
 * you select a note. Tapping the chip instead points the tuner at them:
 * both spectrum-analyser isolation windows jump to ±35 cents around the
 * notes, the analyser zooms in to frame them, and the two strobe bands
 * beneath it then read nothing but the Gu port. While it's armed each note
 * is tinted with its band's colour so it's obvious which is which. Tapping
 * again hands the windows back to their defaults.
 */
import { useEffect, useRef } from 'react';
import {
  useTunerStore,
  ISO_COLORS,
  SPECTRUM_MIN_FREQ,
  SPECTRUM_MAX_FREQ,
} from '../store/tunerStore';
import {
  GU_PORT_CENTS,
  guPortTargets,
  guPortViewRange,
  guPortWindows,
  isGuPortArmed,
} from '../utils/guPort';

const AMBER = '#fbbf24';

export function GuPortChip({ guPort }: { guPort: string[] }) {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const isolations = useTunerStore((s) => s.isolations);

  const targets = guPortTargets(guPort, referenceFreq);
  const windows = guPortWindows(targets.map((t) => t.freq));
  const armed = isGuPortArmed(isolations, windows);

  const arm = () => {
    const s = useTunerStore.getState();
    s.setShowSpectrum(true);
    s.setIsolationWindows(windows);
    const view = guPortViewRange(windows);
    if (view) s.setSpectrumZoom(view[0], view[1]);
  };

  const release = () => {
    const s = useTunerStore.getState();
    s.resetIsolationsToDefault();
    s.setSpectrumZoom(SPECTRUM_MIN_FREQ, SPECTRUM_MAX_FREQ);
  };

  // Follow the reference pitch: at A4=432 the Gu notes sit 32 cents lower,
  // and brackets left at their 440 positions would quietly stop finding
  // them. Migrate only if the windows still match where we put them at the
  // *previous* reference — that's what distinguishes "we're tracking the Gu
  // port" from "the user has since dragged the brackets somewhere else".
  const prevRef = useRef(referenceFreq);
  const guKey = guPort.join('|');
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = referenceFreq;
    if (from === referenceFreq) return;

    const labels = guKey.split('|');
    const at = (ref: number) =>
      guPortWindows(guPortTargets(labels, ref).map((t) => t.freq));

    const s = useTunerStore.getState();
    if (!isGuPortArmed(s.isolations, at(from))) return;

    const moved = at(referenceFreq);
    s.setIsolationWindows(moved);
    const view = guPortViewRange(moved);
    if (view) s.setSpectrumZoom(view[0], view[1]);
  }, [referenceFreq, guKey]);

  // Nothing parseable to aim at (a scale listing its Gu notes as free text)
  // — fall back to the plain, non-interactive label it always was.
  if (targets.length === 0) {
    return (
      <div
        className="text-[11px] font-semibold tracking-wider"
        style={{ gridColumn: '1 / -1', color: AMBER, textAlign: 'center', paddingTop: 2 }}
        title="Notes sometimes tuned into the Gu opening on the underside"
      >
        GU PORT · {guPort.join(' · ')}
      </div>
    );
  }

  return (
    <button
      onClick={armed ? release : arm}
      aria-pressed={armed}
      className="rounded px-2 py-1 leading-tight transition-colors"
      style={{
        gridColumn: '1 / -1',
        marginTop: 2,
        color: AMBER,
        background: armed ? 'rgba(251, 191, 36, 0.16)' : 'rgba(251, 191, 36, 0.06)',
        border: `1px solid rgba(251, 191, 36, ${armed ? 0.6 : 0.28})`,
      }}
      title={
        'Notes sometimes tuned into the Gu opening on the underside. ' +
        `Tap to isolate ±${GU_PORT_CENTS} cents around them on the spectrum ` +
        'analyser and read them on the strobe bands.'
      }
    >
      <span className="block text-[11px] font-semibold tracking-wider">
        GU PORT
        {targets.map((t, i) => (
          <span key={t.label}>
            <span style={{ opacity: 0.55 }}> · </span>
            {/* Once armed, each note wears the colour of the band reading it. */}
            <span style={armed ? { color: ISO_COLORS[i]?.hex ?? AMBER } : undefined}>
              {t.label}
            </span>
          </span>
        ))}
      </span>
      <span
        className="block text-[9px] tracking-wide"
        style={{ color: 'rgba(251, 191, 36, 0.72)', marginTop: 1 }}
      >
        {armed
          ? `Isolated ±${GU_PORT_CENTS}¢ on the analyser · tap to release`
          : `Tap to isolate ±${GU_PORT_CENTS}¢ and strobe them`}
      </span>
    </button>
  );
}
