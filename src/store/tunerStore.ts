import { create } from 'zustand';
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

interface TunerState {
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
  inputDeviceId: string;
  availableDevices: MediaDeviceInfo[];
  openAccordion: 'tuning' | 'bands' | 'settings' | 'stopwatch' | null;
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
  setInputDevice: (deviceId: string) => void;
  setAvailableDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedBand: (id: string | null) => void;
  toggleAccordion: (id: 'tuning' | 'bands' | 'settings' | 'stopwatch') => void;
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

export const useTunerStore = create<TunerState>((set, get) => ({
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
  fftSmoothing: 0.99,
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
  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('v-tune-theme', theme);
    set({ theme });
  },
  setHighContrast: (on) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('v-tune-high-contrast', on ? '1' : '0');
    set({ highContrast: on });
  },
  setLargeText: (on) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('v-tune-large-text', on ? '1' : '0');
    set({ largeText: on });
  },

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
}));
