import { useState, useCallback, useRef } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { noteToFrequency, NOTE_NAMES, getDisplayName } from '../utils/notes';
import { updateWorkletTargets } from '../audio/AudioEngine';
import { playTone, stopTone, getActiveFreq } from '../audio/PitchPipe';

// Piano layout — 7 natural notes (white keys) and 5 sharps (black keys)
const NATURALS = [0, 2, 4, 5, 7, 9, 11]; // C  D  E  F  G  A  B
const SHARPS = [
  { idx: 1,  col: 2 },   // C#  between C and D
  { idx: 3,  col: 4 },   // D#  between D and E
  { idx: 6,  col: 8 },   // F#  between F and G
  { idx: 8,  col: 10 },  // G#  between G and A
  { idx: 10, col: 12 },  // A#  between A and B
];

const LONG_PRESS_MS = 450;

export function PitchDial() {
  const currentNote = useTunerStore((s) => s.currentNote);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const [pipeFreq, setPipeFreq] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const currentOctave = currentNote?.octave ?? 4;
  const currentNoteIdx = currentNote ? NOTE_NAMES.indexOf(currentNote.name) : -1;

  const setNoteFromIndex = useCallback((noteIdx: number, octave: number) => {
    const noteName = NOTE_NAMES[noteIdx];
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

  // Chromatic — every note is always selectable
  const isNoteEnabled = (_noteIdx: number) => true;

  const togglePipe = (noteIdx: number) => {
    const freq = noteToFrequency(NOTE_NAMES[noteIdx], currentOctave, referenceFreq);
    if (getActiveFreq() === freq) {
      stopTone();
      setPipeFreq(null);
    } else {
      playTone(freq);
      setPipeFreq(freq);
    }
  };

  const handlePointerDown = (noteIdx: number) => {
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      togglePipe(noteIdx);
    }, LONG_PRESS_MS);
  };

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerUp = (noteIdx: number) => {
    clearLongPress();
    if (longPressFired.current) return;
    if (autoDetect) return;
    if (!isNoteEnabled(noteIdx)) return;
    setNoteFromIndex(noteIdx, currentOctave);
  };

  const handleOctaveChange = (delta: number) => {
    if (!currentNote || autoDetect) return;
    const newOctave = Math.max(0, Math.min(9, currentNote.octave + delta));
    setNoteFromIndex(NOTE_NAMES.indexOf(currentNote.name), newOctave);
  };

  const NoteButton = ({ idx, isSharp, gridCol }: { idx: number; isSharp: boolean; gridCol: number }) => {
    const enabled = isNoteEnabled(idx);
    const isActive = idx === currentNoteIdx;
    const isPiping =
      pipeFreq !== null &&
      getActiveFreq() === noteToFrequency(NOTE_NAMES[idx], currentOctave, referenceFreq);
    const dimmed = !enabled && !autoDetect;

    const background = isActive
      ? 'var(--accent-blue)'
      : isPiping
        ? 'rgba(255, 200, 0, 0.18)'
        : isSharp
          ? '#0a0a12'
          : 'var(--bg-tertiary)';

    const color = isActive
      ? '#fff'
      : isPiping
        ? 'var(--accent-yellow)'
        : isSharp
          ? 'var(--text-secondary)'
          : 'var(--text-primary)';

    const borderColor = isActive
      ? 'var(--accent-blue)'
      : isPiping
        ? 'var(--accent-yellow)'
        : 'var(--border)';

    return (
      <button
        onPointerDown={() => handlePointerDown(idx)}
        onPointerUp={() => handlePointerUp(idx)}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          togglePipe(idx);
        }}
        className="rounded-md font-medium text-sm transition-colors select-none touch-none"
        style={{
          gridColumn: `${gridCol} / span 2`,
          gridRow: isSharp ? 1 : 2,
          minWidth: 0,
          height: isSharp ? 42 : 60,
          background,
          color,
          border: `1px solid ${borderColor}`,
          opacity: dimmed ? 0.3 : 1,
          cursor: enabled || autoDetect ? 'pointer' : 'default',
          boxShadow: isActive ? '0 1px 0 rgba(255,255,255,0.08) inset' : undefined,
        }}
        title={`${NOTE_NAMES[idx]} — long-press for pitch pipe`}
      >
        {getDisplayName(NOTE_NAMES[idx], noteNaming)}
      </button>
    );
  };

  return (
    <div
      className="flex flex-col gap-2 px-3 py-3 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
    >
      {/* Top row — Octave + Mode + Root */}
      <div className="flex items-center gap-2">
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
      </div>

      {/* Piano-style note grid */}
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

      {/* Active pitch pipe indicator */}
      {pipeFreq !== null && (
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded"
          style={{
            background: 'rgba(255, 200, 0, 0.08)',
            border: '1px solid rgba(255, 200, 0, 0.3)',
          }}
        >
          <span className="text-sm font-bold tracking-wider" style={{ color: 'var(--accent-yellow)' }}>
            ♪ PIPE
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {pipeFreq.toFixed(1)} Hz
          </span>
          <button
            onClick={() => { stopTone(); setPipeFreq(null); }}
            className="ml-auto px-2.5 py-1 rounded text-sm font-medium"
            style={{
              background: 'rgba(255, 59, 59, 0.15)',
              color: 'var(--accent-red)',
              border: '1px solid rgba(255, 59, 59, 0.3)',
            }}
          >
            STOP
          </button>
        </div>
      )}
    </div>
  );
}
