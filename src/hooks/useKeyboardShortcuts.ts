import { useEffect } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { startAudio, stopAudio, updateWorkletTargets } from '../audio/AudioEngine';
import { noteToFrequency, NOTE_NAMES } from '../utils/notes';

const NOTE_KEYS: Record<string, number> = {
  'a': 0,  // C
  'w': 1,  // C#
  's': 2,  // D
  'e': 3,  // D#
  'd': 4,  // E
  'f': 5,  // F
  't': 6,  // F#
  'g': 7,  // G
  'y': 8,  // G#
  'h': 9,  // A
  'u': 10, // A#
  'j': 11, // B
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      const store = useTunerStore.getState();

      // Space: toggle start/stop
      if (e.code === 'Space') {
        e.preventDefault();
        if (store.isRunning) {
          stopAudio();
        } else {
          startAudio(store.inputDeviceId !== 'default' ? store.inputDeviceId : undefined);
        }
        return;
      }

      // Note keys (piano-style: AWSEDFTGYHUJ)
      if (!store.autoDetect && NOTE_KEYS[e.key] !== undefined) {
        const noteIdx = NOTE_KEYS[e.key];
        const octave = store.currentNote?.octave ?? 4;
        const noteName = NOTE_NAMES[noteIdx];
        const freq = noteToFrequency(noteName, octave, store.referenceFreq);
        store.setCurrentNote({
          name: noteName,
          flatName: noteName,
          octave,
          midi: (octave + 1) * 12 + noteIdx,
          frequency: freq,
          centsOff: 0,
        });
        updateWorkletTargets();
        return;
      }

      // Arrow up/down: octave
      if (e.key === 'ArrowUp' && store.currentNote && !store.autoDetect) {
        e.preventDefault();
        const newOct = Math.min(9, store.currentNote.octave + 1);
        const noteName = store.currentNote.name;
        const freq = noteToFrequency(noteName, newOct, store.referenceFreq);
        store.setCurrentNote({
          ...store.currentNote,
          octave: newOct,
          frequency: freq,
          midi: (newOct + 1) * 12 + NOTE_NAMES.indexOf(noteName),
        });
        updateWorkletTargets();
        return;
      }
      if (e.key === 'ArrowDown' && store.currentNote && !store.autoDetect) {
        e.preventDefault();
        const newOct = Math.max(0, store.currentNote.octave - 1);
        const noteName = store.currentNote.name;
        const freq = noteToFrequency(noteName, newOct, store.referenceFreq);
        store.setCurrentNote({
          ...store.currentNote,
          octave: newOct,
          frequency: freq,
          midi: (newOct + 1) * 12 + NOTE_NAMES.indexOf(noteName),
        });
        updateWorkletTargets();
        return;
      }

      // Arrow left/right: cents offset
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        store.setCentsOffset(store.centsOffset - (e.shiftKey ? 10 : 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        store.setCentsOffset(store.centsOffset + (e.shiftKey ? 10 : 1));
        return;
      }

      // B: toggle band editor
      if (e.key === 'b') {
        store.toggleAccordion('bands');
        return;
      }

      // Q: toggle auto detect
      if (e.key === 'q') {
        store.setAutoDetect(!store.autoDetect);
        return;
      }

      // +/-: reference frequency
      if (e.key === '=' || e.key === '+') {
        store.setReferenceFreq(store.referenceFreq + 1);
        updateWorkletTargets();
        return;
      }
      if (e.key === '-') {
        store.setReferenceFreq(store.referenceFreq - 1);
        updateWorkletTargets();
        return;
      }

      // 0: reset cents offset
      if (e.key === '0') {
        store.setCentsOffset(0);
        return;
      }

      // Escape: deselect band
      if (e.key === 'Escape') {
        store.setSelectedBand(null);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
