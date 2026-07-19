import { useCallback } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { noteToFrequency, NOTE_NAMES, getDisplayName, type NoteNaming } from '../utils/notes';
import { updateWorkletTargets } from '../audio/AudioEngine';
import {
  HANDPAN_SCALES,
  CHROMATIC_ID,
  findScale,
  type ScaleNote,
} from '../data/scales';

const NAMING_LABELS: { value: NoteNaming; label: string }[] = [
  { value: 'sharp', label: '♯' },
  { value: 'flat', label: '♭' },
  { value: 'solfege', label: 'Do' },
  { value: 'german', label: 'DE' },
];

// Piano layout — 7 natural notes (white keys) and 5 sharps (black keys)
const NATURALS = [0, 2, 4, 5, 7, 9, 11]; // C  D  E  F  G  A  B
const SHARPS = [
  { idx: 1,  col: 2 },   // C#  between C and D
  { idx: 3,  col: 4 },   // D#  between D and E
  { idx: 6,  col: 8 },   // F#  between F and G
  { idx: 8,  col: 10 },  // G#  between G and A
  { idx: 10, col: 12 },  // A#  between A and B
];

export function PitchDial() {
  const currentNote = useTunerStore((s) => s.currentNote);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const selectedScaleId = useTunerStore((s) => s.selectedScaleId);
  // Live mic-detected note (MIDI). Drives a cyan glow ring on whichever
  // button matches — purely visual, never alters the user's selection.
  const detectedMidi = useTunerStore((s) => s.detectedMidi);

  const activeScale = findScale(selectedScaleId);
  const isScaleMode = activeScale !== null;

  const currentOctave = currentNote?.octave ?? 4;
  const currentNoteIdx = currentNote ? NOTE_NAMES.indexOf(currentNote.name) : -1;

  const setNote = useCallback((noteName: string, octave: number) => {
    const noteIdx = NOTE_NAMES.indexOf(noteName);
    if (noteIdx === -1) return;
    const freq = noteToFrequency(noteName, octave, referenceFreq);
    useTunerStore.getState().setCurrentNote({
      name: noteName,
      flatName: noteName,
      octave,
      midi: (octave + 1) * 12 + noteIdx,
      frequency: freq,
      centsOff: 0,
    });
    updateWorkletTargets();
  }, [referenceFreq]);

  // Pitch pipe used to live on the dial via a long-press / right-click on
  // each note. It now lives per-band on the strobe canvas (♪ icon on the
  // left of each band → off → tone → beep) so users can hear ALL the
  // reference frequencies, not just the root. See StrobeDisplay.tsx.
  const handleNoteClick = (noteName: string, octave: number) => {
    if (autoDetect) return;
    setNote(noteName, octave);
  };

  const handleOctaveChange = (delta: number) => {
    if (!currentNote || autoDetect) return;
    const newOctave = Math.max(0, Math.min(9, currentNote.octave + delta));
    setNote(currentNote.name, newOctave);
  };

  const handleScaleChange = (id: string) => {
    useTunerStore.getState().setSelectedScale(id);
    // When switching INTO a scale, auto-select its ding so the bands
    // immediately reflect the scale's fundamental and the user can start
    // tuning straight away. The ding isn't necessarily the lowest note —
    // extended scales place "bottom notes" below it.
    const next = findScale(id);
    if (next && next.notes.length > 0) {
      const ding = next.notes[next.dingIndex] ?? next.notes[0];
      setNote(ding.name, ding.octave);
    }
  };

  // Pitch class (0–11) currently being picked up by the mic, or -1.
  // Chromatic mode shows only one octave at a time so we match by pitch
  // class — the lit-up key tells the player "you struck a D" no matter
  // which octave the dial happens to be displaying.
  const detectedPitchClass = detectedMidi !== null ? detectedMidi % 12 : -1;

  // ── Piano-keyboard button (chromatic mode) ────────────────────────────
  const NoteButton = ({ idx, isSharp, gridCol }: { idx: number; isSharp: boolean; gridCol: number }) => {
    const noteName = NOTE_NAMES[idx];
    const isActive = idx === currentNoteIdx;
    const isDetected = idx === detectedPitchClass && !isActive;

    const background = isActive
      ? 'var(--accent-blue)'
      : isSharp
        ? '#0a0a12'
        : 'var(--bg-tertiary)';

    const color = isActive
      ? '#fff'
      : isSharp
        ? 'var(--text-secondary)'
        : 'var(--text-primary)';

    const borderColor = isActive ? 'var(--accent-blue)' : 'var(--border)';

    return (
      <button
        onClick={() => handleNoteClick(noteName, currentOctave)}
        className="rounded-md font-medium text-sm transition-colors select-none touch-none"
        style={{
          gridColumn: `${gridCol} / span 2`,
          gridRow: isSharp ? 1 : 2,
          minWidth: 0,
          height: isSharp ? 42 : 60,
          background,
          color,
          border: `1px solid ${borderColor}`,
          cursor: 'pointer',
          boxShadow: isDetected
            ? '0 0 0 2px #22d3ee, 0 0 14px 2px rgba(34, 211, 238, 0.55)'
            : isActive
              ? '0 1px 0 rgba(255,255,255,0.08) inset'
              : undefined,
        }}
        title={noteName}
      >
        {getDisplayName(noteName, noteNaming)}
      </button>
    );
  };

  // ── Single scale-note button (scale mode) ─────────────────────────────
  const ScaleNoteButton = ({ note, isDing }: { note: ScaleNote; isDing: boolean }) => {
    const isActive =
      currentNote !== null &&
      currentNote.name === note.name &&
      currentNote.octave === note.octave;
    const isBottom = !!note.bottom;
    const noteMidi = (note.octave + 1) * 12 + NOTE_NAMES.indexOf(note.name);
    const isDetected = detectedMidi !== null && detectedMidi === noteMidi && !isActive;

    // Ding = purple; bottom note = teal outline; everything else neutral.
    const background = isActive
      ? 'var(--accent-blue)'
      : isDing
        ? 'rgba(168, 85, 247, 0.15)' // highlight the ding
        : isBottom
          ? 'rgba(6, 182, 212, 0.12)'
          : 'var(--bg-tertiary)';
    const color = isActive
      ? '#fff'
      : isDing
        ? '#a855f7'
        : isBottom
          ? '#06b6d4'
          : 'var(--text-primary)';
    const borderColor = isActive
      ? 'var(--accent-blue)'
      : isDing
        ? '#a855f7'
        : isBottom
          ? '#06b6d4'
          : 'var(--border)';

    return (
      <button
        onClick={() => handleNoteClick(note.name, note.octave)}
        className="rounded-md font-medium text-sm transition-colors select-none touch-none px-2 py-2 min-w-0"
        style={{
          background,
          color,
          border: `1px solid ${borderColor}`,
          cursor: 'pointer',
          boxShadow: isDetected
            ? '0 0 0 2px #22d3ee, 0 0 14px 2px rgba(34, 211, 238, 0.55)'
            : undefined,
        }}
        title={`${note.name}${note.octave}${isDing ? ' (ding)' : isBottom ? ' (bottom note)' : ''}`}
      >
        <span className="font-bold">{note.display ?? getDisplayName(note.name, activeScale?.naming ?? noteNaming)}</span>
        <span className="opacity-70 text-xs ml-0.5">{note.octave}</span>
      </button>
    );
  };

  return (
    <div
      data-tour="tour-scale"
      className="flex flex-col gap-2 px-3 py-3 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
    >
      {/* Scale picker — sits above the note grid */}
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0" style={{ color: 'var(--text-dim)' }}>SCALE</span>
        <select
          value={selectedScaleId}
          onChange={(e) => handleScaleChange(e.target.value)}
          className="flex-1 min-w-0 rounded px-2 py-1.5 text-sm"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <option value={CHROMATIC_ID}>Chromatic</option>
          {HANDPAN_SCALES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Note picker — piano keyboard for chromatic, scale-note grid otherwise */}
      {isScaleMode ? (
        <div
          className="grid gap-1"
          style={{
            // 4 buttons per row on narrow, more on wide. minmax(56px,1fr)
            // gives a comfortable touch target while staying responsive.
            gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
          }}
        >
          {activeScale!.notes.map((n, i) => (
            <ScaleNoteButton
              key={`${n.name}${n.octave}`}
              note={n}
              isDing={i === activeScale!.dingIndex}
            />
          ))}
        </div>
      ) : (
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: 'repeat(14, minmax(0, 1fr))',
            gridTemplateRows: 'auto auto',
          }}
        >
          {SHARPS.map(({ idx, col }) => (
            <NoteButton key={idx} idx={idx} isSharp gridCol={col} />
          ))}
          {NATURALS.map((idx, i) => (
            <NoteButton key={idx} idx={idx} isSharp={false} gridCol={i * 2 + 1} />
          ))}
        </div>
      )}

      {/* Octave + note-naming row. Octave control only makes sense in
          chromatic mode (scale notes have a fixed octave each); naming is
          always relevant. */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isScaleMode && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>OCT</span>
            <button
              onClick={() => handleOctaveChange(-1)}
              disabled={autoDetect}
              className="w-8 h-8 rounded flex items-center justify-center text-base transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                opacity: autoDetect ? 0.3 : 1,
              }}
            >−</button>
            <span className="text-base w-6 text-center font-bold" style={{ color: 'var(--text-primary)' }}>
              {currentOctave}
            </span>
            <button
              onClick={() => handleOctaveChange(1)}
              disabled={autoDetect}
              className="w-8 h-8 rounded flex items-center justify-center text-base transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                opacity: autoDetect ? 0.3 : 1,
              }}
            >+</button>
          </div>
        )}

        {/* Naming selector only applies to the chromatic keyboard — when
            a scale is active its `naming` override drives the labels and
            the global preference is irrelevant. */}
        {!isScaleMode && (
          <div className="flex items-center gap-1">
            {NAMING_LABELS.map((n) => (
              <button
                key={n.value}
                onClick={() => useTunerStore.getState().setNoteNaming(n.value)}
                className="px-2.5 py-1 rounded text-sm transition-colors"
                style={{
                  background: noteNaming === n.value ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                  color: noteNaming === n.value ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: noteNaming === n.value ? '1px solid var(--accent-cyan)' : '1px solid var(--border)',
                }}
              >
                {n.label}
              </button>
            ))}
          </div>
        )}

        {/* Keyboard-shortcuts help — opens the map of piano-style note keys.
            Styled like the PURE toggle: translucent purple tint + purple text. */}
        <button
          onClick={() => useTunerStore.getState().setKeyboardHelpOpen(true)}
          className="ml-auto rounded text-xs font-semibold tracking-wide uppercase shrink-0 transition-colors"
          style={{ padding: '7px 12px', background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid var(--border)' }}
          aria-label="Keyboard map"
          title="Keyboard map"
        >
          Map
        </button>
      </div>

    </div>
  );
}
