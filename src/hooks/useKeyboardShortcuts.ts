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

      // A modifier means the keystroke belongs to the OS or the browser, not
      // to us. On desktop ⌘R, ⌘+, ⌥← and friends were landing here as bare
      // keys: ⌘- quietly dropped the reference frequency by a hertz while
      // the user thought they were zooming out, and nothing said so.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Anything focusable that acts on Enter or Space owns those keys. The
      // browser turns them into a click, and e.preventDefault() below
      // cancels that — which left every button in the app keyboard-dead,
      // including the paywall's Unlock, where it is the only control on
      // screen and there is nothing else to tab to.
      const el = e.target instanceof Element ? e.target : null;
      const interactive =
        el?.closest(
          'button, a[href], textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"]',
        ) ?? null;
      if (interactive && (e.code === 'Space' || e.code === 'Enter')) return;

      const store = useTunerStore.getState();

      const toggleAudio = () => {
        if (store.isRunning) {
          stopAudio();
        } else {
          startAudio(store.inputDeviceId !== 'default' ? store.inputDeviceId : undefined);
        }
      };

      // Space: on the desktop layout, slide the controls menu in/out — so you
      // can jump to the next note without reaching for the burger (the menu
      // only exists at ≥1024px). On narrow layouts, keep Space as start/stop.
      if (e.code === 'Space') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 1024px)').matches) {
          store.setMenuOpen(!store.menuOpen);
        } else {
          toggleAudio();
        }
        return;
      }

      // Enter: start/stop the tuner (its own key, so Space can drive the menu
      // on desktop).
      if (e.code === 'Enter') {
        e.preventDefault();
        toggleAudio();
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

      // Arrow left/right used to nudge a global cents offset. They don't
      // any more: that offset was a second reference nothing on screen
      // showed, and a stray keypress could re-pitch an entire instrument.
      // The reference is the A4 field, and only the A4 field.

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
