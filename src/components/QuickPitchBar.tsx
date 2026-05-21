import { useTunerStore } from '../store/tunerStore';
import { NOTE_NAMES, noteToFrequency, getDisplayName } from '../utils/notes';
import { updateWorkletTargets } from '../audio/AudioEngine';

/**
 * Mobile-only quick note picker pinned to the bottom of the strobe area.
 * 4-row grid: three rows of 4 chromatic notes + an octave row.
 */
export function QuickPitchBar() {
  const currentNote = useTunerStore((s) => s.currentNote);
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const noteNaming = useTunerStore((s) => s.noteNaming);

  const currentOctave = currentNote?.octave ?? 4;
  const currentNoteName = currentNote?.name;

  const selectNote = (noteName: string, octave: number) => {
    const idx = NOTE_NAMES.indexOf(noteName);
    if (idx === -1) return;
    const freq = noteToFrequency(noteName, octave, referenceFreq);
    useTunerStore.getState().setCurrentNote({
      name: noteName,
      flatName: noteName,
      octave,
      midi: (octave + 1) * 12 + idx,
      frequency: freq,
      centsOff: 0,
    });
    updateWorkletTargets();
  };

  const changeOctave = (delta: number) => {
    const newOctave = Math.max(0, Math.min(8, currentOctave + delta));
    selectNote(currentNoteName ?? 'A', newOctave);
  };

  const noteRow = (names: readonly string[]) => (
    <div className="grid grid-cols-4 gap-1">
      {names.map((name) => {
        const isActive = name === currentNoteName;
        const isSharp = name.includes('#');
        return (
          <button
            key={name}
            onClick={() => selectNote(name, currentOctave)}
            className="py-2.5 text-base font-medium rounded transition-colors"
            style={{
              background: isActive
                ? 'var(--accent-blue)'
                : isSharp
                  ? '#0a0a12'
                  : 'var(--bg-tertiary)',
              color: isActive
                ? '#fff'
                : isSharp
                  ? 'var(--text-secondary)'
                  : 'var(--text-primary)',
              border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border)'}`,
            }}
          >
            {getDisplayName(name, noteNaming)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="lg:hidden flex flex-col gap-1 px-2 py-2 shrink-0"
      style={{
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {noteRow(NOTE_NAMES.slice(0, 4))}
      {noteRow(NOTE_NAMES.slice(4, 8))}
      {noteRow(NOTE_NAMES.slice(8, 12))}

      {/* Row 4: octave control */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={() => changeOctave(-1)}
          className="w-12 h-10 rounded text-lg flex items-center justify-center"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          −
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-xs tracking-wider" style={{ color: 'var(--text-dim)' }}>
            OCTAVE
          </span>
          <span
            className="text-xl font-bold tabular-nums"
            style={{ color: 'var(--text-primary)', minWidth: '1.25rem', textAlign: 'center' }}
          >
            {currentOctave}
          </span>
        </div>
        <button
          onClick={() => changeOctave(1)}
          className="w-12 h-10 rounded text-lg flex items-center justify-center"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
