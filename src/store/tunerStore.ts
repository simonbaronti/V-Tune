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
  /** Which integer harmonic of the fundamental this foundation band
   * represents: 1 = fundamental, 2 = octave, 3 = compound fifth. Used in
   * 'pure' harmonic mode to target n × f₀ exactly (so a perfectly-tuned
   * handpan reads 0 on every partial) rather than the nearest equal-
   * tempered note. Undefined for user-added custom bands, which always
   * reference their equal-tempered note frequency. */
  harmonic?: number;
}

/** How the foundation bands derive their target frequency.
 *  'pure'  — n × fundamental (just/harmonic intervals). A handpan tuned so
 *            its partials are exact integer multiples reads 0/0/0. The
 *            compound-fifth band targets 3×f₀ (≈ +2¢ above the ET fifth,
 *            because equal temperament flattens fifths by ~2¢). Default.
 *  'equal' — nearest equal-tempered note frequency for each band. The
 *            compound-fifth band targets the ET note, so a pure handpan
 *            reads +2¢ there. For players who tune partials to ET. */
export type HarmonicMode = 'pure' | 'equal';

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
  /** Stable colour slot: 0 = teal (1st window), 1 = purple (2nd). Tied to
   * the window itself, not its array position, so removing the teal window
   * leaves the purple one purple — and a re-added window takes the freed
   * slot's colour. Makes it obvious which spectrum bracket feeds which
   * strobe band. */
  colorIndex: number;
}

export const MAX_ISOLATIONS = 2;

/** Colour per isolation slot — index 0 teal, index 1 purple. Components
 * build rgba()/hex from these so the spectrum bracket and its strobe band
 * always match. */
export const ISO_COLORS = [
  { rgb: '6, 182, 212', hex: '#06b6d4' },   // teal  — 1st window
  { rgb: '168, 85, 247', hex: '#a855f7' },  // purple — 2nd window
] as const;

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
  /** Transient, user-facing message when audio fails to start (no mic,
   *  permission denied, device in use). Shown as a dismissible toast;
   *  null when there's nothing to report. Not persisted. */
  audioError: string | null;
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
  /** Foundation-band frequency reference. 'pure' = n × fundamental (a
   *  perfectly-tuned handpan reads 0 on every partial); 'equal' = nearest
   *  equal-tempered note. See HarmonicMode. */
  harmonicMode: HarmonicMode;
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
  /** Desktop-only: collapse the right sidebar to a skinny strip to give
   *  the strobe display more width. Ignored on tablet/mobile (where the
   *  panel is the slide-out drawer). Persisted. */
  sidebarCollapsed: boolean;
  /** Wide layout (≥1024px, desktop + landscape tablet): is the right
   *  slide-out menu open? Pushes the canvas (shrink/grow). Persisted so it
   *  remembers, defaulting open on first run. */
  menuOpen: boolean;
  /** Keep the desktop slide-out menu open (disables the 20s auto-hide).
   *  User preference — persisted. The desktop counterpart to
   *  quickPickPinned. */
  menuPinned: boolean;
  /** Settings modal open (all viewports). Transient. */
  settingsOpen: boolean;
  keyboardHelpOpen: boolean;
  /** Stopwatch panel visible — toggled by the ⏱ icon in the teal row.
   *  Transient; a running timer shouldn't vanish behind a reload. */
  stopwatchOn: boolean;
  /** Narrow layout (<1024px, phone + portrait tablet): is the bottom
   *  slide-up quick-pick expanded? Transient (auto-hide manages it). */
  quickPickOpen: boolean;
  /** Keep the mobile slide-up quick-pick open (disables the 10s auto-hide).
   *  User preference — persisted. */
  quickPickPinned: boolean;
  /** Stopwatch timer — lifted into the store so it keeps counting when the
   *  panel is toggled off/on or the layout switches (component unmount).
   *  Timestamps are performance.now() ms. Transient. */
  swRunning: boolean;
  swAccumulatedMs: number;
  swStartedAt: number | null;
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
  setAudioError: (msg: string | null) => void;
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
  setHarmonicMode: (mode: HarmonicMode) => void;
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
  resetIsolationsToDefault: () => void;
  setHumFilter: (mode: 'off' | '50' | '60') => void;
  setSelectedScale: (id: string) => void;
  setOnboardingDone: (done: boolean) => void;
  setTourActive: (active: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setKeyboardHelpOpen: (open: boolean) => void;
  setStopwatchOn: (on: boolean) => void;
  setQuickPickOpen: (open: boolean) => void;
  setQuickPickPinned: (pinned: boolean) => void;
  setMenuPinned: (pinned: boolean) => void;
  swToggle: () => void;
  swReset: () => void;
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

/** Two default isolation windows shown on first launch — a teal one and a
 * purple one in sensible, non-overlapping spots in the lower-mid spectrum.
 * The user can drag, resize, remove, and re-add them as before. */
function defaultIsolations(): IsolationWindow[] {
  return [
    { id: `iso-${++isolationCounter}`, minFreq: 250, maxFreq: 400, peakFreq: null, colorIndex: 0 },
    { id: `iso-${++isolationCounter}`, minFreq: 700, maxFreq: 1000, peakFreq: null, colorIndex: 1 },
  ];
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

/** Compute a band's target frequency under the given harmonic mode.
 *  Foundation bands tagged with a harmonic number use n × f₀ in 'pure'
 *  mode; everything else (and all bands in 'equal' mode) uses the
 *  equal-tempered note frequency. f0 is the fundamental's frequency. */
function bandFrequency(
  c: Pick<BandConfig, 'noteName' | 'octave' | 'harmonic'>,
  referenceFreq: number,
  mode: HarmonicMode,
  f0: number,
): number {
  if (mode === 'pure' && c.harmonic) return f0 * c.harmonic;
  return noteToFrequency(c.noteName, c.octave, referenceFreq);
}

/** Recompute every band's target frequency for a new referenceFreq and/or
 *  harmonic mode. The fundamental (harmonic === 1) sets f₀; pure-mode
 *  foundation bands then derive as integer multiples of it. */
function rebuildFrequencies(
  configs: BandConfig[],
  referenceFreq: number,
  mode: HarmonicMode,
): BandConfig[] {
  const fund = configs.find((c) => c.harmonic === 1);
  const f0 = fund
    ? noteToFrequency(fund.noteName, fund.octave, referenceFreq)
    : referenceFreq;
  return configs.map((c) => ({
    ...c,
    frequency: bandFrequency(c, referenceFreq, mode, f0),
  }));
}

function defaultBandsForNote(
  note: NoteInfo,
  referenceFreq: number,
  mode: HarmonicMode,
): BandConfig[] {
  const f0 = noteToFrequency(note.name, note.octave, referenceFreq);
  const configs: BandConfig[] = [];
  // Fundamental (1st harmonic)
  configs.push({
    id: makeBandId(),
    noteName: note.name,
    octave: note.octave,
    harmonic: 1,
    frequency: bandFrequency({ noteName: note.name, octave: note.octave, harmonic: 1 }, referenceFreq, mode, f0),
    isFoundation: true,
  });
  // Octave above (2nd harmonic — identical in both modes since 2:1 is exact)
  configs.push({
    id: makeBandId(),
    noteName: note.name,
    octave: note.octave + 1,
    harmonic: 2,
    frequency: bandFrequency({ noteName: note.name, octave: note.octave + 1, harmonic: 2 }, referenceFreq, mode, f0),
    isFoundation: true,
  });
  // Octave + 5th / compound 5th (3rd harmonic — pure 3:1 vs ET differ ~2¢)
  const fifthIndex = (NOTE_NAMES.indexOf(note.name) + 7) % 12;
  const fifthName = NOTE_NAMES[fifthIndex];
  const fifthOctave = note.octave + 1 + (NOTE_NAMES.indexOf(note.name) + 7 >= 12 ? 1 : 0);
  configs.push({
    id: makeBandId(),
    noteName: fifthName,
    octave: fifthOctave,
    harmonic: 3,
    frequency: bandFrequency({ noteName: fifthName, octave: fifthOctave, harmonic: 3 }, referenceFreq, mode, f0),
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

const INITIAL_BANDS = defaultBandsForNote(INITIAL_NOTE, 440, 'pure');

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
  audioError: null,
  autoDetect: false,
  detectedMidi: null,
  pipeBandId: null,
  pipeMode: null,
  inputDeviceId: 'default',
  availableDevices: [],
  openAccordion: null,
  noteNaming: 'sharp',
  harmonicMode: 'pure',
  // No longer user-facing (no slider) — tweak these defaults here. Kept out
  // of the persist whitelist so the value below is always authoritative.
  displaySmoothing: 0.20,
  strobeSpeed: 1,
  showSpectrum: true,
  readoutSmoothing: 0.70,
  micGainDb: 0,
  inTuneHysteresis: 1.0,
  strobeIntensity: 0.9,
  strobeSoftness: 0.35,
  fftSize: 16384,
  fftSmoothing: 0.80,
  isolations: defaultIsolations(),
  humFilter: (typeof localStorage !== 'undefined' && (localStorage.getItem('v-tune-hum') as 'off' | '50' | '60' | null)) || 'off',
  // Default to chromatic on a fresh install. Once the user picks a scale
  // the persist middleware remembers it across sessions.
  selectedScaleId: 'chromatic',
  onboardingDone: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-onboarding-done') === '1'),
  tourActive: false,
  panelOpen: false,
  sidebarCollapsed: false,
  menuOpen: true,
  menuPinned: false,
  settingsOpen: false,
  keyboardHelpOpen: false,
  stopwatchOn: false,
  quickPickOpen: false,
  quickPickPinned: false,
  swRunning: false,
  swAccumulatedMs: 0,
  swStartedAt: null,
  // Default to light mode for fresh installs; a persisted choice (or the
  // legacy 'v-tune-theme' key set to 'dark') overrides.
  theme: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-theme') === 'dark' ? 'dark' : 'light'),
  highContrast: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-high-contrast') === '1'),
  largeText: (typeof localStorage !== 'undefined' && localStorage.getItem('v-tune-large-text') === '1'),

  setRunning: (running) => set({ isRunning: running }),

  setReferenceFreq: (freq) => {
    const state = get();
    const updated = rebuildFrequencies(state.bandConfigs, freq, state.harmonicMode);
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
    const newBands = defaultBandsForNote(note, state.referenceFreq, state.harmonicMode);
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
  setAudioError: (msg) => set({ audioError: msg }),
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
  setHarmonicMode: (mode) => {
    const state = get();
    // Recompute every band's target under the new mode, then update state.
    // The caller (UI toggle) pushes the new targets to the worklet via
    // updateWorkletTargets() so the strobe re-references immediately.
    const updated = rebuildFrequencies(state.bandConfigs, state.referenceFreq, mode);
    set({
      harmonicMode: mode,
      bandConfigs: updated,
      bands: configsToBands(updated),
    });
  },
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
    // Take whichever colour slot is free (teal first), so a re-added window
    // reclaims the colour of the one that was removed.
    const used = new Set(state.isolations.map((i) => i.colorIndex));
    const colorIndex = used.has(0) ? 1 : 0;
    set({
      isolations: [...state.isolations, { id, minFreq: lo, maxFreq: hi, peakFreq: null, colorIndex }],
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
  resetIsolationsToDefault: () => set({ isolations: defaultIsolations() }),
  // The persist middleware handles localStorage automatically for all
  // whitelisted fields below — setters just update state.
  setHumFilter: (mode) => set({ humFilter: mode }),
  setSelectedScale: (id) => set({ selectedScaleId: id }),
  setOnboardingDone: (done) => set({ onboardingDone: done }),
  setTourActive: (active) => set({ tourActive: active }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setSidebarCollapsed: (collapsed) =>
    set((s) => ({
      sidebarCollapsed: collapsed,
      // Collapsing to the skinny strip also closes any open accordion so
      // expanding the sidebar again starts from a clean, all-closed state.
      openAccordion: collapsed ? null : s.openAccordion,
    })),
  setMenuOpen: (open) => set({ menuOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setKeyboardHelpOpen: (open) => set({ keyboardHelpOpen: open }),
  setStopwatchOn: (on) => set({ stopwatchOn: on }),
  setQuickPickOpen: (open) => set({ quickPickOpen: open }),
  setQuickPickPinned: (pinned) => set({ quickPickPinned: pinned }),
  setMenuPinned: (pinned) => set({ menuPinned: pinned }),
  swToggle: () =>
    set((s) => {
      if (s.swRunning) {
        const now = performance.now();
        return {
          swRunning: false,
          swAccumulatedMs: s.swAccumulatedMs + (now - (s.swStartedAt ?? now)),
          swStartedAt: null,
        };
      }
      return { swRunning: true, swStartedAt: performance.now() };
    }),
  swReset: () => set({ swRunning: false, swAccumulatedMs: 0, swStartedAt: null }),
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
    const newBands = defaultBandsForNote(state.currentNote, state.referenceFreq, state.harmonicMode);
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
      // covered theme / hum / onboarding-done — now
      // every "wait, why did this reset?" setting is sticky.
      // ─────────────────────────────────────────────────────────────────
      name: 'v-tune-store',
      version: 3,
      storage: createJSONStorage(() => localStorage),

      // → v3: new default experience — Spectrum Analyser on with two
      // colour-coded isolation windows (teal + purple). Applied to any pre-v3
      // install; existing isolation windows keep their positions (only
      // colorIndex is backfilled). (Display/readout smoothing are no longer
      // persisted — their defaults live in the initializer.)
      migrate: (persisted, version) => {
        const s = persisted as Partial<TunerState>;
        if (version < 3) {
          s.showSpectrum = true;
          if (!s.isolations || s.isolations.length === 0) {
            s.isolations = defaultIsolations();
          } else {
            s.isolations = s.isolations.map((iso, i) => ({
              ...iso,
              colorIndex: iso.colorIndex ?? (i % ISO_COLORS.length),
            }));
          }
        }
        return s;
      },

      // Whitelist what gets saved. Transient fields (isRunning, peaks,
      // rmsLevel, bands runtime data, tour state, etc.) are NOT in here
      // and therefore reset to their initial values on every launch.
      partialize: (state) => ({
        // User settings
        referenceFreq: state.referenceFreq,
        tolerance: state.tolerance,
        noteNaming: state.noteNaming,
        harmonicMode: state.harmonicMode,
        strobeSpeed: state.strobeSpeed,
        micGainDb: state.micGainDb,
        inTuneHysteresis: state.inTuneHysteresis,
        strobeIntensity: state.strobeIntensity,
        strobeSoftness: state.strobeSoftness,
        fftSize: state.fftSize,
        fftSmoothing: state.fftSmoothing,
        humFilter: state.humFilter,
        selectedScaleId: state.selectedScaleId,
        showSpectrum: state.showSpectrum,
        openAccordion: state.openAccordion,
        // menuOpen is intentionally NOT persisted — the menu always loads
        // open (so the controls are visible on launch) and the 10s auto-hide
        // manages it per-session. Persisting it would make an auto-hide stick
        // "closed" across reloads.
        quickPickPinned: state.quickPickPinned,
        menuPinned: state.menuPinned,
        sidebarCollapsed: state.sidebarCollapsed,
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
        // Re-derive every band's target frequency under the (now restored)
        // referenceFreq + harmonicMode. This also self-heals bands persisted
        // by an older build (pre-harmonic-mode) whose foundation bands lack
        // the `harmonic` tag and would otherwise stay equal-tempered: if any
        // foundation band is missing its harmonic number, regenerate the
        // foundation set fresh from the last note while keeping custom bands.
        const foundationsUntagged = merged.bandConfigs.some(
          (c) => c.isFoundation && c.harmonic === undefined,
        );
        if (foundationsUntagged && merged.currentNote) {
          const fresh = defaultBandsForNote(
            merged.currentNote,
            merged.referenceFreq,
            merged.harmonicMode,
          );
          const custom = merged.bandConfigs.filter((c) => !c.isFoundation);
          merged.bandConfigs = partitionAndSort([...fresh, ...custom]);
        } else {
          merged.bandConfigs = rebuildFrequencies(
            merged.bandConfigs,
            merged.referenceFreq,
            merged.harmonicMode,
          );
        }
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
