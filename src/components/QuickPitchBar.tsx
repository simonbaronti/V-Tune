import { useCallback, useEffect, useRef } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { NOTE_NAMES, noteToFrequency, getDisplayName } from '../utils/notes';
import { updateWorkletTargets, startAudio, stopAudio } from '../audio/AudioEngine';
import { findScale, HANDPAN_SCALES, CHROMATIC_ID, type ScaleNote } from '../data/scales';
import { TealIconRow } from './TealIconRow';

const AUTO_HIDE_MS = 20_000;

/**
 * Mobile / portrait-tablet bottom slide-up note picker.
 *
 * Collapsed: a teal icon row + a bar showing the currently-selected note.
 * Tapping the note (or the chevron) slides the full picker up, pushing the
 * canvas content up (it auto-shrinks). Auto-hides after 10s of no
 * interaction unless pinned. Pin lives in the teal row.
 */
export function QuickPitchBar() {
  const currentNote = useTunerStore((s) => s.currentNote);
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const isRunning = useTunerStore((s) => s.isRunning);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);
  const selectedScaleId = useTunerStore((s) => s.selectedScaleId);
  const setSelectedScale = useTunerStore((s) => s.setSelectedScale);
  const detectedMidi = useTunerStore((s) => s.detectedMidi);
  const detectedPitchClass = detectedMidi !== null ? detectedMidi % 12 : -1;

  const quickPickOpen = useTunerStore((s) => s.quickPickOpen);
  const setQuickPickOpen = useTunerStore((s) => s.setQuickPickOpen);
  const pinned = useTunerStore((s) => s.quickPickPinned);
  const setPinned = useTunerStore((s) => s.setQuickPickPinned);
  const tourActive = useTunerStore((s) => s.tourActive);

  const expanded = quickPickOpen || pinned;

  const activeScale = findScale(selectedScaleId);
  const isScaleMode = activeScale !== null;
  const scaleNaming = activeScale?.naming ?? noteNaming;

  const currentOctave = currentNote?.octave ?? 4;
  const currentNoteName = currentNote?.name;

  // ── Auto-hide after 10s idle (unless pinned) ────────────────────────
  const hideTimer = useRef<number | null>(null);
  const armHide = useCallback(() => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
    // Never auto-hide while pinned or during the onboarding tour.
    if (pinned || tourActive) return;
    hideTimer.current = window.setTimeout(() => {
      useTunerStore.getState().setQuickPickOpen(false);
    }, AUTO_HIDE_MS);
  }, [pinned, tourActive]);

  useEffect(() => {
    if (quickPickOpen && !pinned && !tourActive) armHide();
    else if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [quickPickOpen, pinned, tourActive, armHide]);

  // Any interaction inside the slide-up resets the idle timer.
  const bump = () => {
    if (quickPickOpen && !pinned && !tourActive) armHide();
  };

  const handleToggleAudio = async () => {
    if (isRunning) stopAudio();
    else await startAudio(inputDeviceId !== 'default' ? inputDeviceId : undefined);
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
        const isDetected = !isActive && NOTE_NAMES.indexOf(name) === detectedPitchClass;
        return (
          <button
            key={name}
            onClick={() => selectNote(name, currentOctave)}
            className="py-2.5 text-base font-medium rounded transition-colors"
            style={{
              background: isActive ? 'var(--accent-blue)' : isSharp ? '#0a0a12' : 'var(--bg-tertiary)',
              color: isActive ? '#fff' : isSharp ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border)'}`,
              boxShadow: isDetected ? '0 0 0 2px #22d3ee, 0 0 12px 2px rgba(34, 211, 238, 0.5)' : undefined,
            }}
          >
            {getDisplayName(name, noteNaming)}
          </button>
        );
      })}
    </div>
  );

  // ── Scale note button ───────────────────────────────────────────────
  const ScaleButton = ({ note, isDing }: { note: ScaleNote; isDing: boolean }) => {
    const isActive =
      currentNote !== null && currentNote.name === note.name && currentNote.octave === note.octave;
    const noteMidi = (note.octave + 1) * 12 + NOTE_NAMES.indexOf(note.name);
    const isDetected = !isActive && detectedMidi !== null && detectedMidi === noteMidi;
    const background = isActive ? 'var(--accent-blue)' : isDing ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-tertiary)';
    const color = isActive ? '#fff' : isDing ? '#a855f7' : 'var(--text-primary)';
    const borderColor = isActive ? 'var(--accent-blue)' : isDing ? '#a855f7' : 'var(--border)';
    return (
      <button
        onClick={() => selectNote(note.name, note.octave)}
        className="py-2.5 px-1 text-base font-medium rounded transition-colors min-w-0"
        style={{
          background,
          color,
          border: `1px solid ${borderColor}`,
          boxShadow: isDetected ? '0 0 0 2px #22d3ee, 0 0 12px 2px rgba(34, 211, 238, 0.5)' : undefined,
        }}
        title={`${note.name}${note.octave}${isDing ? ' (ding)' : ''}`}
      >
        <span className="font-bold">{getDisplayName(note.name, scaleNaming)}</span>
        <span className="opacity-70 text-xs ml-0.5">{note.octave}</span>
      </button>
    );
  };

  const noteLabel = currentNoteName
    ? `${getDisplayName(currentNoteName, isScaleMode ? scaleNaming : noteNaming)}${currentOctave}`
    : 'Select note';

  return (
    <div
      className="flex flex-col shrink-0"
      onPointerDown={bump}
      onPointerMove={bump}
      style={{
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border)',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
        paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Selected-note bar — always visible; tap to toggle the picker. The
          purple glow gives it presence as the primary tap target. */}
      <button
        data-tour="tour-notebar"
        onClick={() => setQuickPickOpen(!quickPickOpen)}
        className="mx-1 my-2 rounded-lg flex items-center justify-center gap-2.5 py-2.5"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid rgba(168, 85, 247, 0.55)',
          boxShadow: '0 0 14px 1px rgba(168, 85, 247, 0.4)',
        }}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse note picker' : 'Open note picker'}
      >
        <span className="text-xl font-bold tracking-wide tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {noteLabel}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 150ms ease' }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable — teal icon row (now inside the slide-up) + the picker.
          Slides open, pushing the canvas up. */}
      <div
        style={{
          maxHeight: expanded ? 820 : 0,
          overflow: 'hidden',
          transition: 'max-height 260ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="-mx-2 mb-1">
          <TealIconRow>
            <button
              onClick={() => setPinned(!pinned)}
              aria-label={pinned ? 'Unpin picker' : 'Keep picker open'}
              aria-pressed={pinned}
              title={pinned ? 'Unpin' : 'Keep open'}
              data-tour="tour-pin"
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
              style={{
                color: pinned ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                background: pinned ? 'rgba(6, 182, 212, 0.18)' : 'transparent',
                border: `1px solid ${pinned ? 'var(--accent-cyan)' : 'transparent'}`,
              }}
            >
              {/* Pin icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
              </svg>
            </button>
          </TealIconRow>
        </div>

        <div className="flex flex-col gap-1 pb-1">
          {/* Scale picker + note grid — grouped so the tour highlights the
              whole scale section, not just the dropdown. */}
          <div data-tour="tour-scale" className="flex flex-col gap-1">
          {/* Scale picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-wider shrink-0" style={{ color: 'var(--text-dim)' }}>SCALE</span>
            <select
              value={selectedScaleId}
              onChange={(e) => { setSelectedScale(e.target.value); bump(); }}
              className="flex-1 min-w-0 rounded px-2 py-1.5 text-sm"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              <option value={CHROMATIC_ID}>Chromatic</option>
              {HANDPAN_SCALES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {isScaleMode ? (
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))' }}>
              {activeScale!.notes.map((n, i) => (
                <ScaleButton key={`${n.name}${n.octave}`} note={n} isDing={i === activeScale!.dingIndex} />
              ))}
            </div>
          ) : (
            <>
              {noteRow(NOTE_NAMES.slice(0, 4))}
              {noteRow(NOTE_NAMES.slice(4, 8))}
              {noteRow(NOTE_NAMES.slice(8, 12))}
            </>
          )}
          </div>

          {/* OCT (chromatic only) + Let's Go */}
          <div className="flex items-center gap-2 pt-1">
            {!isScaleMode && (
              <>
                <button
                  onClick={() => changeOctave(-1)}
                  className="w-11 h-10 rounded text-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >−</button>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-xs tracking-wider" style={{ color: 'var(--text-dim)' }}>OCT</span>
                  <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)', minWidth: '1.25rem', textAlign: 'center' }}>
                    {currentOctave}
                  </span>
                </div>
                <button
                  onClick={() => changeOctave(1)}
                  className="w-11 h-10 rounded text-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >+</button>
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
      </div>
    </div>
  );
}
