import { useTunerStore } from '../store/tunerStore';
import { NOTE_NAMES, noteToFrequency, getDisplayName } from '../utils/notes';
import { updateWorkletTargets, startAudio, stopAudio } from '../audio/AudioEngine';
import { findScale, type ScaleNote } from '../data/scales';

/**
 * Mobile-only quick note picker pinned to the bottom of the strobe area.
 *
 * Chromatic mode: 3 rows of 4 chromatic notes + an OCT/Start-Stop row.
 * Scale mode:     responsive grid of scale-specific notes (each labelled
 *                 with the octave) + Start-Stop row (no OCT control —
 *                 each scale note has a fixed octave).
 *
 * Mirrors the desktop PitchDial's scale behaviour so the experience
 * is consistent across viewports.
 */
export function QuickPitchBar() {
  const currentNote = useTunerStore((s) => s.currentNote);
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const isRunning = useTunerStore((s) => s.isRunning);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);
  const selectedScaleId = useTunerStore((s) => s.selectedScaleId);

  const activeScale = findScale(selectedScaleId);
  const isScaleMode = activeScale !== null;
  // In scale mode the displayed accidentals follow the scale's own
  // convention (Kurd → flats, Amara → sharps) rather than the user's
  // global naming preference. Matches PitchDial.
  const scaleNaming = activeScale?.naming ?? noteNaming;

  const currentOctave = currentNote?.octave ?? 4;
  const currentNoteName = currentNote?.name;

  const handleToggleAudio = async () => {
    if (isRunning) {
      stopAudio();
    } else {
      await startAudio(inputDeviceId !== 'default' ? inputDeviceId : undefined);
    }
  };

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

  // ── Chromatic note row (4 notes per row) ────────────────────────────
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

  // ── Scale note button (used in scale mode) ──────────────────────────
  const ScaleButton = ({ note, isDing }: { note: ScaleNote; isDing: boolean }) => {
    const isActive =
      currentNote !== null &&
      currentNote.name === note.name &&
      currentNote.octave === note.octave;

    const background = isActive
      ? 'var(--accent-blue)'
      : isDing
        ? 'rgba(168, 85, 247, 0.15)'
        : 'var(--bg-tertiary)';
    const color = isActive
      ? '#fff'
      : isDing
        ? '#a855f7'
        : 'var(--text-primary)';
    const borderColor = isActive
      ? 'var(--accent-blue)'
      : isDing
        ? '#a855f7'
        : 'var(--border)';

    return (
      <button
        onClick={() => selectNote(note.name, note.octave)}
        className="py-2.5 px-1 text-base font-medium rounded transition-colors min-w-0"
        style={{ background, color, border: `1px solid ${borderColor}` }}
        title={`${note.name}${note.octave}${isDing ? ' (ding)' : ''}`}
      >
        <span className="font-bold">{getDisplayName(note.name, scaleNaming)}</span>
        <span className="opacity-70 text-xs ml-0.5">{note.octave}</span>
      </button>
    );
  };

  return (
    <div
      className="lg:hidden flex flex-col gap-1 pt-2 shrink-0"
      style={{
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        // Respect the iPhone home-indicator strip + landscape side insets
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {isScaleMode ? (
        <div
          className="grid gap-1"
          // 4-col floor on narrow phones, fills out to more cols on tablets.
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))' }}
        >
          {activeScale!.notes.map((n, i) => (
            <ScaleButton
              key={`${n.name}${n.octave}`}
              note={n}
              isDing={i === activeScale!.dingIndex}
            />
          ))}
        </div>
      ) : (
        <>
          {noteRow(NOTE_NAMES.slice(0, 4))}
          {noteRow(NOTE_NAMES.slice(4, 8))}
          {noteRow(NOTE_NAMES.slice(8, 12))}
        </>
      )}

      {/* Bottom row: OCT control (chromatic only) + Start/Stop. The Start
          button fills whatever width remains, so on scale mode (no OCT)
          it expands to the full row. */}
      <div className="flex items-center gap-2 pt-1">
        {!isScaleMode && (
          <>
            <button
              onClick={() => changeOctave(-1)}
              className="w-11 h-10 rounded text-lg flex items-center justify-center shrink-0"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              −
            </button>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-xs tracking-wider" style={{ color: 'var(--text-dim)' }}>
                OCT
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
              className="w-11 h-10 rounded text-lg flex items-center justify-center shrink-0"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              +
            </button>
          </>
        )}

        <button
          data-tour="lets-go"
          onClick={handleToggleAudio}
          className="flex-1 h-10 rounded text-base font-semibold tracking-wide flex items-center justify-center gap-2"
          style={{ background: isRunning ? 'var(--accent-red)' : 'var(--accent-green)', color: '#000' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 12 5.5 21.5a2.121 2.121 0 1 1-3-3L12 9" />
            <path d="M17.64 15 22 10.64" />
            <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
          </svg>
          {isRunning ? 'STOP' : "Let's Go"}
        </button>
      </div>
    </div>
  );
}
