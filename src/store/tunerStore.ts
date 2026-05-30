import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { noteToFrequency, NOTE_NAMES, type NoteInfo, type NoteNaming } from '../utils/notes';

export interface BandConfig {
  id: string;
  noteName: string;
  octave: number;
  frequency: number;
  /** Foundation bands (fundamental + octave + 12th) are auto-managed —
   * they can't be edited, removed, or reordered. */
  isFoundation: boolean;
}

export interface StrobeBand extends BandConfig {
  magnitude: number;
  phase: number;
  phaseDelta: number;
  centsDelta: number;
  accumulatedPhase: number;
}

export interface PeakData {
  freq: number;
  magnitude: number;
  db: number;
}

/** A user-drawn isolation window on the spectrum analyser. */
export interface IsolationWindow {
  id: string;
  minFreq: number;
  maxFreq: number;
  /** Loudest peak (Hz) found inside the window on the last frame, or null
   * when there's nothing above the noise gate inside the bracket. */
  peakFreq: number | null;
}

export const MAX_ISOLATIONS = 2;

export interface TunerState {
  isRunning: boolean;
  referenceFreq: number;
  currentNote: NoteInfo | null;
  centsOffset: number;
  baseFrequency: number;
  bandConfigs: BandConfig[];
  bands: StrobeBand[];
  selectedBandId: string | null;
  rmsLevel: number;
  peaks: PeakData[];
  tolerance: number;
  autoDetect: boolean;
  /** Live pitch indicator — the MIDI number of whichever note the
   *  microphone is currently picking up while audio is running. Updated
   *  continuously by the YIN detector in AudioEngine. Used purely for
   *  visual feedback on the pitch wheel (lit-up note); does NOT change
   *  `currentNote` (which is the user-selected tuning target). `null`
   *  when the mic is off or no stable pitch is detected. */
  detectedMidi: number | null;

  /** Per-band pitch pipe (LinoTune-style). At most one band is "piping"
   *  at a time. Three modes per band:
   *    null       — off
   *    'tone'     — continuous sine reference tone
   *    'beep'     — silent until the band detects a strike, then emits
   *                 a brief reference beep on each fresh onset
   *  Cycle order on the ♪ icon: off → tone → beep → off.
   *  Clicking the icon on a different band moves the pipe to that band
   *  while preserving the current mode. */
  pipeBandId: string | null;
  pipeMode: 'tone' | 'beep' | null;
  inputDeviceId: string;
  availableDevices: MediaDeviceInfo[];
  openAccordion: 'tuning' | 'settings' | 'stopwatch' | null;
  noteNaming: NoteNaming;
  displaySmoothing: number;
  strobeSpeed: number;
  showSpectrum: boolean;
  readoutSmoothing: number;
  micGainDb: number;
  inTuneHysteresis: number;
  strobeIntensity: number;
  strobeSoftness: number;
  fftSize: number;
  fftSmoothing: number;
  // Spectrum-analyser isolation windows — up to 2 user-drawn frequency
  // brackets. Each loudest-peak-in-window drives a live tuning band
  // rendered under the spectrum. When two exist the band area splits 50/50.
  isolations: IsolationWindow[];
  // Mains-hum notch filter — cascaded biquad notches in the worklet at
  // f, 2f, 3f, 4f. 'off' bypasses; '50' / '60' picks the region's grid Hz.
  humFilter: 'off' | '50' | '60';
  // Tauri-only: keep the desktop window above other windows.
  alwaysOnTop: boolean;
  // Pre-saved handpan scale that filters the note picker. 'chromatic'
  // means "show the full piano keyboard"; any other value is the id of
  // an entry in src/data/scales.ts.
  selectedScaleId: string;
  // Onboarding tour — `onboardingDone` is persisted (skipped on first
  // launch only); `tourActive` is transient and toggled by the tour
  // overlay itself. `panelOpen` lives here so the tour can drive the
  // mobile slide-out drawer (open it for accordion steps, close it for
  // canvas-area steps).
  onboardingDone: boolean;
  tourActive: boolean;
  panelOpen: boolean;
  theme: 'dark' | 'light';
  highContrast: boolean;
  largeText: boolean;

  setRunning: (running: boolean) => void;
  setReferenceFreq: (freq: number) => void;
  setCurrentNote: (note: NoteInfo) => void;
  setCentsOffset: (cents: number) => void;
  updateBands: (bandData: { targetFreq: number; magnitude: number; phase: number; phaseDelta: number; centsDelta: number }[]) => void;
  setRmsLevel: (level: number) => void;
  setPeaks: (peaks: PeakData[]) => void;
  setTolerance: (cents: number) => void;
  setAutoDetect: (auto: boolean) => void;
  setDetectedMidi: (midi: number | null) => void;
  /** Cycle the pitch-pipe for the given band id (off → tone → beep → off).
   *  Clicking a different band id moves the pipe to that band, keeping
   *  whichever mode was active. */
  cyclePipeBand: (id: string) => void;
  /** Force-stop the pipe (no band, no mode). Called from tour completion
   *  / audio stop so we never leave a stray tone running. */
  clearPipe: () => void;
  setInputDevice: (deviceId: string) => void;
  setAvailableDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedBand: (id: string | null) => void;
  toggleAccordion: (id: 'tuning' | 'settings' | 'stopwatch') => void;
  setNoteNaming: (naming: NoteNaming) => void;
  setDisplaySmoothing: (value: number) => void;
  setStrobeSpeed: (speed: number) => void;
  setShowSpectrum: (show: boolean) => void;
  setReadoutSmoothing: (value: number) => void;
  setMicGainDb: (value: number) => void;
  setInTuneHysteresis: (value: number) => void;
  setStrobeIntensity: (value: number) => void;
  setStrobeSoftness: (value: number) => void;
  setFftSize: (size: number) => void;
  setFftSmoothing: (value: number) => void;
  /** Returns the new isolation's id, or null if the cap is already reached. */
  addIsolation: (minFreq: number, maxFreq: number) => string | null;
  removeIsolation: (id: string) => void;
  updateIsolationRange: (id: string, minFreq: number, maxFreq: number) => void;
  setIsolationPeak: (id: string, freq: number | null) => void;
  clearIsolations: () => void;
  setHumFilter: (mode: 'off' | '50' | '60') => void;
  setAlwaysOnTop: (on: boolean) => void;
  setSelectedScale: (id: string) => void;
  setOnboardingDone: (done: boolean) => void;
  setTourActive: (active: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setHighContrast: (on: boolean) => void;
  setLargeText: (on: boolean) => void;
  addBandByNote: (noteName: string, octave: number) => void;
  removeBand: (id: string) => void;
  updateBandNote: (id: string, noteName: string, octave: number) => void;
  reorderBands: (fromIndex: number, toIndex: number) => void;
  syncBandsToCurrentNote: () => void;
  getTargetFrequencies: () => number[];
}

let bandCounter = 0;
function makeBandId(): string {
  return `band-${++bandCounter}`;
}

let isolationCounter = 0;

function configsToBands(configs: BandConfig[]): StrobeBand[] {
  return configs.map((c) => ({
    ...c,
    magnitude: 0,
    phase: 0,
    phaseDelta: 0,
    centsDelta: 0,
    accumulatedPhase: 0,
  }));
}

function rebuildFrequencies(configs: BandConfig[], referenceFreq: number): BandConfig[] {
  return configs.map((c) => ({
    ...c,
    frequency: noteToFrequency(c.noteName, c.octave, referenceFreq),
  }));
}

function defaultBandsForNote(note: NoteInfo, referenceFreq: number): BandConfig[] {
  const configs: BandConfig[] = [];
  // Fundamental
  configs.push({
    id: makeBandId(),
    noteName: note.name,
    octave: note.octave,
    frequency: noteToFrequency(note.name, note.octave, referenceFreq),
    isFoundation: true,
  });
  // Octave above
  configs.push({
    id: makeBandId(),
    noteName: note.name,
    octave: note.octave + 1,
    frequency: noteToFrequency(note.name, note.octave + 1, referenceFreq),
    isFoundation: true,
  });
  // Octave + 5th (compound 5th)
  const fifthIndex = (NOTE_NAMES.indexOf(note.name) + 7) % 12;
  const fifthName = NOTE_NAMES[fifthIndex];
  const fifthOctave = note.octave + 1 + (NOTE_NAMES.indexOf(note.name) + 7 >= 12 ? 1 : 0);
  configs.push({
    id: makeBandId(),
    noteName: fifthName,
    octave: fifthOctave,
    frequency: noteToFrequency(fifthName, fifthOctave, referenceFreq),
    isFoundation: true,
  });
  return configs.sort((a, b) => b.frequency - a.frequency);
}

/** Re-sorts a band list so additional bands stack on top (sorted by freq
 * desc) and foundation bands stay locked at the bottom in their order. */
function partitionAndSort(configs: BandConfig[]): BandConfig[] {
  const additional = configs.filter((c) => !c.isFoundation).sort((a, b) => b.frequency - a.frequency);
  const foundation = configs.filter((c) => c.isFoundation).sort((a, b) => b.frequency - a.frequency);
  return [...additional, ...foundation];
}

const INITIAL_NOTE: NoteInfo = {
  name: 'A',
  flatName: 'A',
  octave: 4,
  midi: 69,
  frequency: 440,
  centsOff: 0,
};

const INITIAL_BANDS = defaultBandsForNote(INITIAL_NOTE, 440);

export const useTunerStore = create<TunerState>()(
  persist(
    (set, get) => ({
  isRunning: false,
  referenceFreq: 440,
  currentNote: null,
  centsOffset: 0,
  baseFrequency: 440,
  bandConfigs: INITIAL_BANDS,
  bands: configsToBands(INITIAL_BANDS),
  selectedBandId: null,
  rmsLevel: 0,
  peaks: [],
  tolerance: 5,
  autoDetect: false,
  detectedMidi: null,
  pipeBandId: null,
  pipeMode: null,
  inputDeviceId: 'default',
  availableDevices: [],
  openAccordion: null,
  noteNaming: 'sharp',
  displaySmoothing: 0.93,
  strobeSpeed: 1,
  showSpectrum: false,
  readoutSmoothing: 0.95,
  micGainDb: 0,
  inTuneHysteresis: 1.0,
  strobeIntensity: 0.9,
  strobeSoftness: 0.35,
  fftSize: 16384,
  fftSmoothing: 0.80,
  isolations: [],
  humFilter: (typeof localStorage !== 'undefined' && (localStorage.getItem('v-tune-hum') as 'off' | '50' | '60' | null)) || 'off',
  alwaysOnTop: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-always-on-top') === '1'),
  // Default to chromatic on a fresh install. Once the user picks a scale
  // the persist middleware remembers it across sessions.
  selectedScaleId: 'chromatic',
  onboardingDone: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-onboarding-done') === '1'),
  tourActive: false,
  panelOpen: false,
  theme: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-theme') === 'light' ? 'light' : 'dark'),
  highContrast: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-high-contrast') === '1'),
  largeText: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-large-text') === '1'),

  setRunning: (running) => set({ isRunning: running }),

  setReferenceFreq: (freq) => {
    const state = get();
    const updated = rebuildFrequencies(state.bandConfigs, freq);
    set({
      referenceFreq: freq,
      baseFrequency: state.currentNote
        ? noteToFrequency(state.currentNote.name, state.currentNote.octave, freq)
        : freq,
      bandConfigs: updated,
      bands: configsToBands(updated),
    });
  },

  setCurrentNote: (note) => {
    const state = get();
    const newBase = note.frequency * Math.pow(2, state.centsOffset / 1200);
    const newBands = defaultBandsForNote(note, state.referenceFreq);
    set({
      currentNote: note,
      baseFrequency: newBase,
      bandConfigs: newBands,
      bands: configsToBands(newBands),
    });
  },

  setCentsOffset: (cents) => {
    const state = get();
    const note = state.currentNote;
    if (note) {
      const newBase = note.frequency * Math.pow(2, cents / 1200);
      set({ centsOffset: cents, baseFrequency: newBase });
    } else {
      set({ centsOffset: cents });
    }
  },

  updateBands: (bandData) => {
    set((state) => {
      const updated = state.bands.map((band) => {
        const data = bandData.find((d) => Math.abs(d.targetFreq - band.frequency) < 0.5);
        if (!data) return band;
        return {
          ...band,
          magnitude: data.magnitude,
          phase: data.phase,
          phaseDelta: data.phaseDelta,
          centsDelta: data.centsDelta,
          accumulatedPhase: band.accumulatedPhase + data.phaseDelta,
        };
      });
      return { bands: updated };
    });
  },

  setRmsLevel: (level) => set({ rmsLevel: level }),
  setPeaks: (peaks) => set({ peaks }),
  setTolerance: (cents) => set({ tolerance: cents }),
  setAutoDetect: (auto) => set({ autoDetect: auto }),
  setDetectedMidi: (midi) => set({ detectedMidi: midi }),
  cyclePipeBand: (id) => set((s) => {
    // Different band — move the pipe over, keep current mode (or start
    // on tone if pipe was off).
    if (s.pipeBandId !== id) {
      return { pipeBandId: id, pipeMode: s.pipeMode ?? 'tone' };
    }
    // Same band — cycle tone → beep → off.
    if (s.pipeMode === 'tone') return { pipeBandId: id, pipeMode: 'beep' };
    if (s.pipeMode === 'beep') return { pipeBandId: null, pipeMode: null };
    // Off → tone (defensive — shouldn't be reached if pipeBandId is set
    // but pipeMode is null, but cheap to handle).
    return { pipeBandId: id, pipeMode: 'tone' };
  }),
  clearPipe: () => set({ pipeBandId: null, pipeMode: null }),
  setInputDevice: (deviceId) => set({ inputDeviceId: deviceId }),
  setAvailableDevices: (devices) => set({ availableDevices: devices }),
  setSelectedBand: (id) => set((s) => ({ selectedBandId: s.selectedBandId === id ? null : id })),
  toggleAccordion: (id) => set((s) => ({ openAccordion: s.openAccordion === id ? null : id })),
  setNoteNaming: (naming) => set({ noteNaming: naming }),
  setDisplaySmoothing: (value) => set({ displaySmoothing: value }),
  setStrobeSpeed: (speed) => set({ strobeSpeed: speed }),
  setShowSpectrum: (show) => set({ showSpectrum: show }),
  setReadoutSmoothing: (value) => set({ readoutSmoothing: value }),
  setMicGainDb: (value) => set({ micGainDb: value }),
  setInTuneHysteresis: (value) => set({ inTuneHysteresis: value }),
  setStrobeIntensity: (value) => set({ strobeIntensity: value }),
  setStrobeSoftness: (value) => set({ strobeSoftness: value }),
  setFftSize: (size) => set({ fftSize: size }),
  setFftSmoothing: (value) => set({ fftSmoothing: value }),
  addIsolation: (minFreq, maxFreq) => {
    const state = get();
    if (state.isolations.length >= MAX_ISOLATIONS) return null;
    const lo = Math.min(minFreq, maxFreq);
    const hi = Math.max(minFreq, maxFreq);
    const id = `iso-${++isolationCounter}`;
    set({
      isolations: [...state.isolations, { id, minFreq: lo, maxFreq: hi, peakFreq: null }],
    });
    return id;
  },
  removeIsolation: (id) => {
    set((s) => ({ isolations: s.isolations.filter((iso) => iso.id !== id) }));
  },
  updateIsolationRange: (id, minFreq, maxFreq) => {
    const lo = Math.min(minFreq, maxFreq);
    const hi = Math.max(minFreq, maxFreq);
    set((s) => ({
      isolations: s.isolations.map((iso) =>
        iso.id === id ? { ...iso, minFreq: lo, maxFreq: hi } : iso,
      ),
    }));
  },
  setIsolationPeak: (id, freq) => {
    set((s) => ({
      isolations: s.isolations.map((iso) =>
        iso.id === id ? { ...iso, peakFreq: freq } : iso,
      ),
    }));
  },
  clearIsolations: () => set({ isolations: [] }),
  // The persist middleware handles localStorage automatically for all
  // whitelisted fields below — setters just update state.
  setHumFilter: (mode) => set({ humFilter: mode }),
  setAlwaysOnTop: (on) => set({ alwaysOnTop: on }),
  setSelectedScale: (id) => set({ selectedScaleId: id }),
  setOnboardingDone: (done) => set({ onboardingDone: done }),
  setTourActive: (active) => set({ tourActive: active }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setTheme: (theme) => set({ theme }),
  setHighContrast: (on) => set({ highContrast: on }),
  setLargeText: (on) => set({ largeText: on }),

  addBandByNote: (noteName, octave) => {
    const state = get();
    const exists = state.bandConfigs.some(
      (c) => c.noteName === noteName && c.octave === octave,
    );
    if (exists) return;

    const config: BandConfig = {
      id: makeBandId(),
      noteName,
      octave,
      frequency: noteToFrequency(noteName, octave, state.referenceFreq),
      isFoundation: false,
    };
    const newConfigs = partitionAndSort([...state.bandConfigs, config]);
    set({
      bandConfigs: newConfigs,
      bands: configsToBands(newConfigs),
    });
  },

  removeBand: (id) => {
    const state = get();
    const band = state.bandConfigs.find((c) => c.id === id);
    if (!band || band.isFoundation) return; // Foundation bands are locked
    const newConfigs = state.bandConfigs.filter((c) => c.id !== id);
    set({
      bandConfigs: newConfigs,
      bands: configsToBands(newConfigs),
      selectedBandId: state.selectedBandId === id ? null : state.selectedBandId,
    });
  },

  updateBandNote: (id, noteName, octave) => {
    const state = get();
    const target = state.bandConfigs.find((c) => c.id === id);
    if (!target || target.isFoundation) return; // Foundation bands are locked
    const updated = state.bandConfigs.map((c) => {
      if (c.id !== id) return c;
      return {
        ...c,
        noteName,
        octave,
        frequency: noteToFrequency(noteName, octave, state.referenceFreq),
      };
    });
    const newConfigs = partitionAndSort(updated);
    set({
      bandConfigs: newConfigs,
      bands: configsToBands(newConfigs),
    });
  },

  reorderBands: (fromIndex, toIndex) => {
    const state = get();
    const fromBand = state.bandConfigs[fromIndex];
    const toBand = state.bandConfigs[toIndex];
    // Either band missing, or either is a foundation → no-op
    if (!fromBand || !toBand || fromBand.isFoundation || toBand.isFoundation) return;
    const configs = [...state.bandConfigs];
    const [moved] = configs.splice(fromIndex, 1);
    configs.splice(toIndex, 0, moved);
    set({
      bandConfigs: configs,
      bands: configsToBands(configs),
    });
  },

  syncBandsToCurrentNote: () => {
    const state = get();
    if (!state.currentNote) return;
    const newBands = defaultBandsForNote(state.currentNote, state.referenceFreq);
    set({
      bandConfigs: newBands,
      bands: configsToBands(newBands),
      selectedBandId: null,
    });
  },

  getTargetFrequencies: () => {
    return get().bandConfigs.map((c) => c.frequency);
  },
}),
    {
      // ─────────────────────────────────────────────────────────────────
      // Persistence: everything that's a real user preference (settings,
      // last-tuned note, isolation windows, accordion state) is saved to
      // localStorage under one key and restored on app launch. Anything
      // that's transient runtime state (live mic data, audio-running
      // flag, tour state, etc.) is excluded so it always starts fresh.
      //
      // Replaces the per-setting localStorage.setItem calls that only
      // covered theme / hum / always-on-top / onboarding-done — now
      // every "wait, why did this reset?" setting is sticky.
      // ─────────────────────────────────────────────────────────────────
      name: 'v-tune-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),

      // Whitelist what gets saved. Transient fields (isRunning, peaks,
      // rmsLevel, bands runtime data, tour state, etc.) are NOT in here
      // and therefore reset to their initial values on every launch.
      partialize: (state) => ({
        // User settings
        referenceFreq: state.referenceFreq,
        tolerance: state.tolerance,
        noteNaming: state.noteNaming,
        displaySmoothing: state.displaySmoothing,
        strobeSpeed: state.strobeSpeed,
        readoutSmoothing: state.readoutSmoothing,
        micGainDb: state.micGainDb,
        inTuneHysteresis: state.inTuneHysteresis,
        strobeIntensity: state.strobeIntensity,
        strobeSoftness: state.strobeSoftness,
        fftSize: state.fftSize,
        fftSmoothing: state.fftSmoothing,
        humFilter: state.humFilter,
        alwaysOnTop: state.alwaysOnTop,
        selectedScaleId: state.selectedScaleId,
        showSpectrum: state.showSpectrum,
        openAccordion: state.openAccordion,
        inputDeviceId: state.inputDeviceId,
        // Last-tuned note + custom band setup
        currentNote: state.currentNote,
        centsOffset: state.centsOffset,
        bandConfigs: state.bandConfigs,
        // User-drawn isolation windows
        isolations: state.isolations,
        // Theme / accessibility
        theme: state.theme,
        highContrast: state.highContrast,
        largeText: state.largeText,
        // One-time flags
        onboardingDone: state.onboardingDone,
      }),

      // After hydration, rebuild the derived runtime state (the `bands`
      // array and `baseFrequency`) from the persisted note + bandConfigs.
      // These aren't persisted directly because they're derivable, and
      // doing it here keeps the saved blob smaller and stale-data-free.
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<TunerState>),
        };
        merged.bands = configsToBands(merged.bandConfigs);
        merged.baseFrequency = merged.currentNote
          ? noteToFrequency(
              merged.currentNote.name,
              merged.currentNote.octave,
              merged.referenceFreq,
            )
          : merged.referenceFreq;
        return merged;
      },
    },
  ),
);
