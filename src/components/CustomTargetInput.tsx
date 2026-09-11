/**
 * Type a target frequency in Hz instead of picking a note.
 *
 * Asked for by a luthier tracking overtones against a base that isn't on the
 * 12-TET grid, but it's just as useful for matching an instrument you've
 * measured before, or working from a maker's spec sheet written in hertz.
 *
 * There's no new targeting machinery behind it. A typed frequency is split
 * into the nearest note plus the leftover cents — exactly the pair the FINE
 * offset already drives — so the bands, the purple "this isn't standard"
 * chip and the persistence all come for free. The remainder is applied
 * unrounded, so the decimals someone types actually survive: a tenth of a
 * cent is about 0.025 Hz at concert A, and rounding there would quietly
 * throw away the precision that's the whole point of typing a number.
 */
import { useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { frequencyToNote, getDisplayName } from '../utils/notes';
import { updateWorkletTargets } from '../audio/AudioEngine';

// The range the analyser itself covers — offering more would be a lie.
const MIN_HZ = 20;
const MAX_HZ = 5000;

export function CustomTargetInput() {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const baseFrequency = useTunerStore((s) => s.baseFrequency);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    // Accept a comma as the decimal separator — most of Europe types that.
    const hz = parseFloat(text.trim().replace(',', '.'));
    if (!isFinite(hz) || hz < MIN_HZ || hz > MAX_HZ) {
      setError(`Enter a frequency between ${MIN_HZ} and ${MAX_HZ} Hz.`);
      return;
    }
    setError(null);

    const note = frequencyToNote(hz, referenceFreq);
    const store = useTunerStore.getState();
    // `note.frequency` is the nearest note's exact equal-tempered pitch and
    // `note.centsOff` is how far the typed value sits from it. Setting both
    // lands the target precisely on what was typed.
    store.setCurrentNote({ ...note, centsOff: 0 });
    store.setCentsOffset(note.centsOff);
    updateWorkletTargets();
    setText('');
  };

  const nearest = frequencyToNote(baseFrequency, referenceFreq);
  const nearestLabel = `${getDisplayName(nearest.name, noteNaming)}${nearest.octave}`;

  return (
    <div className="flex flex-col gap-1" style={{ opacity: autoDetect ? 0.4 : 1 }}>
      <div className="flex items-center gap-1.5">
        <span
          className="text-xs tracking-wider shrink-0"
          style={{ color: 'var(--text-dim)' }}
        >
          Hz
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={autoDetect}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply();
          }}
          placeholder={baseFrequency.toFixed(2)}
          aria-label="Target frequency in hertz"
          className="flex-1 min-w-0 rounded px-2 py-1.5 text-sm tabular-nums"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />
        <button
          onClick={apply}
          disabled={autoDetect || text.trim() === ''}
          className="rounded px-3 py-1.5 text-xs font-semibold tracking-wide shrink-0 transition-colors"
          style={{
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#a855f7',
            border: '1px solid var(--border)',
            opacity: autoDetect || text.trim() === '' ? 0.4 : 1,
          }}
        >
          SET
        </button>
      </div>
      <span className="text-[10px] leading-snug" style={{ color: 'var(--text-dim)' }}>
        {error
          ? error
          : autoDetect
            ? 'Turn AUTO off to set a target by frequency.'
            : `Targeting ${baseFrequency.toFixed(2)} Hz · nearest note ${nearestLabel}`}
      </span>
    </div>
  );
}
