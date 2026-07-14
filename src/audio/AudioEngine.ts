import { Capacitor } from '@capacitor/core';
import { useTunerStore } from '../store/tunerStore';
import { frequencyToNote } from '../utils/notes';
import { isoRefinedFreq } from '../components/bgSignal';
import { YIN } from 'pitchfinder';

let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let stream: MediaStream | null = null;
let isoUnsub: (() => void) | null = null;
let lastIsolations: unknown = null;

/**
 * Push the current isolation windows' rough peaks to the worklet so it can
 * phase-rate-refine them, and drop any refined values for windows that no
 * longer exist. Called on start and whenever the isolations array changes.
 */
function postIsoTargets(): void {
  if (!workletNode) return;
  const iso = useTunerStore.getState().isolations;
  workletNode.port.postMessage({
    type: 'setIsoTargets',
    targets: iso.map((i) => ({ id: i.id, freq: i.peakFreq })),
  });
  const ids = new Set(iso.map((i) => i.id));
  for (const k of Object.keys(isoRefinedFreq)) {
    if (!ids.has(k)) delete isoRefinedFreq[k];
  }
}
// Safari/WKWebView pumps a capture MediaStream into the Web Audio graph only
// while the stream is attached to a *playing* HTMLMediaElement — otherwise
// the MediaStreamAudioSourceNode emits pure silence (RMS exactly 0). This
// hidden muted sink keeps the stream live so audio actually flows.
let keepAliveSink: HTMLAudioElement | null = null;
let yinDetector: ((buffer: Float32Array) => number | null) | null = null;

const ANALYSIS_BUFFER_SIZE = 4096;
let analyserNode: AnalyserNode | null = null;
let pitchBuffer: Float32Array | null = null;
let pitchAnimFrame: number | null = null;

// Live "what note is being played" indicator — runs the whole time audio
// is on, independent of AUTO. Drives the lit-up note on the pitch wheel.
let liveDetectFrame: number | null = null;
let liveDetectBuffer: Float32Array | null = null;
// Hold the last reported MIDI for a short window so brief mic drops don't
// flicker the highlight off and back on between strikes.
const LIVE_HOLD_FRAMES = 30; // ~0.5s at 60fps
let liveLastMidi: number | null = null;
let liveSilentFrames = 0;

export async function startAudio(deviceId?: string): Promise<void> {
  const store = useTunerStore.getState();
  // Clear any stale error from a previous attempt.
  store.setAudioError(null);

  try {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Keep the capture stream attached to a muted, playing <audio> element.
    // Without this, WebKit leaves the MediaStreamAudioSourceNode silent.
    keepAliveSink = new Audio();
    keepAliveSink.muted = true;
    keepAliveSink.setAttribute('playsinline', '');
    keepAliveSink.srcObject = stream;
    keepAliveSink.style.display = 'none';
    document.body.appendChild(keepAliveSink);
    void keepAliveSink.play().catch(() => {});

    // Desktop WebKit/Safari bug: createMediaStreamSource yields SILENCE when the
    // AudioContext sample rate differs from the capture device's actual rate
    // (common with 48 kHz USB mics while the system output runs at 44.1 kHz)
    // — the OS shows input level but the graph receives nothing. Build the
    // context to match the track's real rate so audio actually flows.
    //
    // BUT only off native: on iOS/Capacitor forcing the rate can leave
    // audioContext.sampleRate reporting a value the mic doesn't actually
    // deliver, which scales every detected frequency (an iPad read every note
    // ~a semitone sharp while an iPhone was fine). Native iOS ran the plain
    // context correctly pre-1.1.0, so there we let the OS pick the rate.
    const track0 = stream.getAudioTracks()[0];
    const trackRate = track0?.getSettings?.().sampleRate;
    const forceTrackRate = !!trackRate && !Capacitor.isNativePlatform();
    try {
      audioContext = forceTrackRate ? new AudioContext({ sampleRate: trackRate }) : new AudioContext();
    } catch {
      // Older WebKit without the sampleRate constructor option.
      audioContext = new AudioContext();
    }
    const sampleRate = audioContext.sampleRate;

    await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

    sourceNode = audioContext.createMediaStreamSource(stream);
    gainNode = audioContext.createGain();
    gainNode.gain.value = dbToGain(store.micGainDb);
    workletNode = new AudioWorkletNode(audioContext, 'tuner-processor');
    // The worklet reads its own render-thread `sampleRate` global (the true
    // rate), so we no longer message a rate in — see audio-worklet-processor.js.

    const freqs = store.getTargetFrequencies();
    workletNode.port.postMessage({
      type: 'setTargets',
      frequencies: freqs,
      referenceFreq: store.referenceFreq,
    });

    // Push the current hum-filter setting straight away so it takes effect
    // from the first hop instead of waiting for the next user toggle.
    workletNode.port.postMessage({
      type: 'setHumFilter',
      hz: store.humFilter === 'off' ? 0 : parseInt(store.humFilter, 10),
    });

    workletNode.port.onmessage = (e) => {
      if (e.data.type === 'analysis') {
        const store = useTunerStore.getState();
        store.updateBands(e.data.bands);
        store.setRmsLevel(e.data.rmsLevel);
        store.setPeaks(e.data.peaks);
        if (e.data.isoPeaks) {
          for (const p of e.data.isoPeaks) isoRefinedFreq[p.id] = p.freq;
        }
      }
    };

    // Feed the worklet each isolation window's rough peak so it can refine it
    // with phase-rate. The isolations array reference only changes when a peak
    // meaningfully moves (SpectrumAnalyzer throttles it) or a window is added/
    // removed, so the identity guard keeps this to a few posts per second.
    isoUnsub?.();
    lastIsolations = null;
    postIsoTargets();
    isoUnsub = useTunerStore.subscribe((s) => {
      if (s.isolations === lastIsolations) return;
      lastIsolations = s.isolations;
      postIsoTargets();
    });

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = store.fftSize;
    analyserNode.smoothingTimeConstant = store.fftSmoothing;
    pitchBuffer = new Float32Array(ANALYSIS_BUFFER_SIZE);

    sourceNode.connect(gainNode);
    gainNode.connect(workletNode);
    gainNode.connect(analyserNode);

    // WebKit/WKWebView (and Safari) create the AudioContext in a 'suspended'
    // state even inside a user gesture — without an explicit resume() the
    // worklet's process() loop never runs, so the strobe gets no signal even
    // though getUserMedia succeeded and the OS shows input level. Chrome
    // auto-resumes on a gesture, which is why this only surfaced on macOS
    // desktop (notably older WebKit, e.g. 2017 MacBooks).
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    yinDetector = YIN({ sampleRate });
    liveDetectBuffer = new Float32Array(ANALYSIS_BUFFER_SIZE);

    if (store.autoDetect) {
      startPitchDetection();
    }

    // Always run the live "what note is being played" indicator while
    // audio is on — it lights up notes on the pitch wheel without
    // selecting them.
    startLiveNoteDetection();

    // Permission is now granted, so device labels are available — refresh
    // the input list (passively, no second prompt) so the Settings dropdown
    // shows real device names even if it was opened before audio started.
    enumerateDevices(false).catch(() => {});

    store.setRunning(true);
  } catch (err) {
    console.error('Failed to start audio:', err);
    // Translate the raw getUserMedia/DOMException into a friendly,
    // actionable message and surface it via the store (toast). We do NOT
    // re-throw — callers `await startAudio()` without a catch, so throwing
    // would just become a silent unhandled rejection (the original "Let's
    // Go does nothing" bug). Recording the message is what makes the
    // failure visible.
    const name =
      err && typeof err === 'object' && 'name' in err ? (err as DOMException).name : '';
    let msg = 'Couldn’t start audio. Check your microphone and try again.';
    if (name === 'OverconstrainedError') {
      // The chosen device exists in the list but can't actually be opened —
      // common in the macOS desktop WebView with USB mics, which it lists but
      // won't capture from. Point the user back to a device that works.
      msg = 'Couldn’t open that microphone. Pick “Default” in Settings, or use the web app for that device.';
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      msg = 'No microphone detected. Connect a microphone, then tap Let’s Go again.';
    } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      msg = 'Microphone access is blocked. Allow microphone access in your system settings, then try again.';
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      msg = 'Your microphone is in use by another app. Close it and try again.';
    }
    useTunerStore.getState().setAudioError(msg);
    // Make sure we're not left in a half-started state.
    useTunerStore.getState().setRunning(false);
  }
}

// One-shot auto-detect: require this many consecutive frames of the same
// detected MIDI note before locking in.
const PITCH_LOCK_VOTES = 4;
let pitchVoteMidi = -1;
let pitchVoteCount = 0;

function startPitchDetection() {
  // Guard against double-starts (subscriber + startAudio could both fire)
  if (pitchAnimFrame !== null) return;

  pitchVoteMidi = -1;
  pitchVoteCount = 0;

  const detect = () => {
    if (!analyserNode || !pitchBuffer || !yinDetector) {
      pitchAnimFrame = null;
      return;
    }

    const store = useTunerStore.getState();
    if (!store.isRunning || !store.autoDetect) {
      pitchAnimFrame = null;
      return;
    }

    analyserNode.getFloatTimeDomainData(pitchBuffer as Float32Array<ArrayBuffer>);
    const pitch = yinDetector(pitchBuffer);

    if (pitch && pitch > 20 && pitch < 10000) {
      const note = frequencyToNote(pitch, store.referenceFreq);
      if (note.midi >= 24 && note.midi <= 108) {
        if (note.midi === pitchVoteMidi) {
          pitchVoteCount++;
          if (pitchVoteCount >= PITCH_LOCK_VOTES) {
            // Confident lock — set the note, push to worklet, turn AUTO off
            store.setCurrentNote(note);
            updateWorkletTargets();
            store.setAutoDetect(false);
            pitchVoteMidi = -1;
            pitchVoteCount = 0;
            pitchAnimFrame = null;
            return;
          }
        } else {
          pitchVoteMidi = note.midi;
          pitchVoteCount = 1;
        }
      }
    } else {
      pitchVoteMidi = -1;
      pitchVoteCount = 0;
    }

    pitchAnimFrame = requestAnimationFrame(detect);
  };

  pitchAnimFrame = requestAnimationFrame(detect);
}

// Listen for AUTO being toggled on after startup — start detection whenever
// (autoDetect ↑ AND isRunning) regardless of the order they happen in.
useTunerStore.subscribe((state, prevState) => {
  if (state.autoDetect && !prevState.autoDetect && state.isRunning) {
    startPitchDetection();
  }
  // Live-push hum-filter changes to the worklet (no restart needed).
  if (state.humFilter !== prevState.humFilter && workletNode) {
    workletNode.port.postMessage({
      type: 'setHumFilter',
      hz: state.humFilter === 'off' ? 0 : parseInt(state.humFilter, 10),
    });
  }
});

// Continuous live-pitch indicator (independent of AUTO). Updates the
// store's `detectedMidi` every ~2 frames so the pitch wheel can light up
// whichever chromatic note is being struck. Cheap: single YIN call per
// tick, same buffer reused.
function startLiveNoteDetection() {
  if (liveDetectFrame !== null) return;
  liveLastMidi = null;
  liveSilentFrames = 0;
  useTunerStore.getState().setDetectedMidi(null);

  let frameCount = 0;
  const tick = () => {
    if (!analyserNode || !liveDetectBuffer || !yinDetector) {
      liveDetectFrame = null;
      return;
    }
    const store = useTunerStore.getState();
    if (!store.isRunning) {
      liveDetectFrame = null;
      return;
    }

    // Throttle to every other frame — this is purely visual feedback so
    // sub-30Hz updates are fine and keep CPU low.
    frameCount++;
    if (frameCount % 2 === 0) {
      analyserNode.getFloatTimeDomainData(liveDetectBuffer as Float32Array<ArrayBuffer>);
      const pitch = yinDetector(liveDetectBuffer);

      // Gate on the same RMS the worklet reports so we don't latch onto
      // room hiss between strikes.
      const rmsOk = store.rmsLevel > 0.01;

      if (rmsOk && pitch && pitch > 20 && pitch < 10000) {
        const note = frequencyToNote(pitch, store.referenceFreq);
        if (note.midi >= 24 && note.midi <= 108) {
          if (note.midi !== liveLastMidi) {
            liveLastMidi = note.midi;
            store.setDetectedMidi(note.midi);
          }
          liveSilentFrames = 0;
        } else {
          liveSilentFrames++;
        }
      } else {
        liveSilentFrames++;
      }

      // Hold the last detected note for a short window so brief gaps
      // between strikes don't flicker the indicator off.
      if (liveSilentFrames > LIVE_HOLD_FRAMES && liveLastMidi !== null) {
        liveLastMidi = null;
        store.setDetectedMidi(null);
      }
    }

    liveDetectFrame = requestAnimationFrame(tick);
  };
  liveDetectFrame = requestAnimationFrame(tick);
}

export function updateWorkletTargets() {
  if (!workletNode) return;
  const store = useTunerStore.getState();
  const freqs = store.getTargetFrequencies();
  workletNode.port.postMessage({
    type: 'setTargets',
    frequencies: freqs,
    referenceFreq: store.referenceFreq,
  });
}

export function stopAudio() {
  if (pitchAnimFrame) {
    cancelAnimationFrame(pitchAnimFrame);
    pitchAnimFrame = null;
  }

  if (liveDetectFrame) {
    cancelAnimationFrame(liveDetectFrame);
    liveDetectFrame = null;
  }
  liveLastMidi = null;
  liveSilentFrames = 0;
  useTunerStore.getState().setDetectedMidi(null);

  if (isoUnsub) {
    isoUnsub();
    isoUnsub = null;
  }
  lastIsolations = null;
  for (const k of Object.keys(isoRefinedFreq)) delete isoRefinedFreq[k];

  if (workletNode) {
    workletNode.disconnect();
    workletNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (keepAliveSink) {
    keepAliveSink.pause();
    keepAliveSink.srcObject = null;
    keepAliveSink.remove();
    keepAliveSink = null;
  }

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // Stopping the mic also stops any pitch-pipe — the user explicitly
  // halted the session, so leaving a stray reference tone running would
  // be surprising.
  useTunerStore.getState().clearPipe();
  useTunerStore.getState().setRunning(false);
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function setAnalyserFftSize(size: number): void {
  if (analyserNode) analyserNode.fftSize = size;
}

export function setAnalyserSmoothing(value: number): void {
  if (analyserNode) analyserNode.smoothingTimeConstant = value;
}

// Convert decibels to a linear amplitude multiplier (0 dB = unity gain)
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function setMicGainDb(db: number): void {
  if (gainNode) gainNode.gain.value = dbToGain(db);
}

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

/**
 * Populate the input-device dropdown.
 *
 * Browsers — and especially the macOS WKWebView the Tauri desktop build
 * runs in — only return *labelled* devices from enumerateDevices() once
 * microphone permission has been granted. Before that, the call returns
 * either an empty list or entries with blank `label`/`deviceId`, which is
 * why the dropdown looked empty on a fresh launch (Settings opened before
 * the user ever pressed "Let's Go").
 *
 * If we detect that state, do a one-shot getUserMedia() to trigger the
 * permission prompt — that unlocks the real device list — then immediately
 * stop the probe stream so we don't hold the mic open. Pass
 * `probe = false` to skip the prompt (e.g. a passive refresh after audio
 * is already running and permission is therefore already granted).
 */
export async function enumerateDevices(probe = true): Promise<MediaDeviceInfo[]> {
  let devices = await navigator.mediaDevices.enumerateDevices();
  let audioInputs = devices.filter((d) => d.kind === 'audioinput');

  const needsPermission =
    audioInputs.length === 0 || audioInputs.every((d) => d.label === '');

  if (probe && needsPermission) {
    try {
      const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      probeStream.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
      audioInputs = devices.filter((d) => d.kind === 'audioinput');
    } catch (err) {
      // Permission denied, or no input device present — surface whatever
      // we have (likely empty) rather than throwing.
      console.warn('Microphone permission probe failed; input list may be empty.', err);
    }
  }

  // WebKit/WKWebView exposes the *full* device list only momentarily (right
  // after a getUserMedia probe), then collapses it to just default + built-in
  // on the next passive enumerate / devicechange. A plain overwrite would
  // therefore drop a USB mic the user already saw. Instead MERGE by deviceId,
  // keeping previously-seen devices and preferring labelled entries, so once a
  // device appears it stays selectable. (Ignore the blank-id placeholders some
  // browsers return before permission.)
  const merged = new Map<string, MediaDeviceInfo>();
  for (const d of useTunerStore.getState().availableDevices) {
    if (d.deviceId) merged.set(d.deviceId, d);
  }
  for (const d of audioInputs) {
    if (!d.deviceId) continue;
    const existing = merged.get(d.deviceId);
    if (!existing || (!existing.label && d.label)) merged.set(d.deviceId, d);
  }
  const mergedList = merged.size ? Array.from(merged.values()) : audioInputs;
  useTunerStore.getState().setAvailableDevices(mergedList);
  return mergedList;
}
