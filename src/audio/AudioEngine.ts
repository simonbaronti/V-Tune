import { useTunerStore } from '../store/tunerStore';
import { frequencyToNote } from '../utils/notes';
import { YIN } from 'pitchfinder';

let audioContext: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let stream: MediaStream | null = null;
let yinDetector: ((buffer: Float32Array) => number | null) | null = null;

const ANALYSIS_BUFFER_SIZE = 4096;
let analyserNode: AnalyserNode | null = null;
let pitchBuffer: Float32Array | null = null;
let pitchAnimFrame: number | null = null;

export async function startAudio(deviceId?: string): Promise<void> {
  const store = useTunerStore.getState();

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
    audioContext = new AudioContext();
    const sampleRate = audioContext.sampleRate;

    await audioContext.audioWorklet.addModule('/audio-worklet-processor.js');

    sourceNode = audioContext.createMediaStreamSource(stream);
    gainNode = audioContext.createGain();
    gainNode.gain.value = dbToGain(store.micGainDb);
    workletNode = new AudioWorkletNode(audioContext, 'tuner-processor');

    workletNode.port.postMessage({ type: 'setSampleRate', sampleRate });

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
      }
    };

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = store.fftSize;
    analyserNode.smoothingTimeConstant = store.fftSmoothing;
    pitchBuffer = new Float32Array(ANALYSIS_BUFFER_SIZE);

    sourceNode.connect(gainNode);
    gainNode.connect(workletNode);
    gainNode.connect(analyserNode);

    yinDetector = YIN({ sampleRate });

    if (store.autoDetect) {
      startPitchDetection();
    }

    store.setRunning(true);
  } catch (err) {
    console.error('Failed to start audio:', err);
    throw err;
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

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

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

export async function enumerateDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  useTunerStore.getState().setAvailableDevices(audioInputs);
  return audioInputs;
}
