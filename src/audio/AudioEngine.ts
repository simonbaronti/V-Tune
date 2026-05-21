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
    gainNode.gain.value = store.micGain;
    workletNode = new AudioWorkletNode(audioContext, 'tuner-processor');

    workletNode.port.postMessage({ type: 'setSampleRate', sampleRate });

    const freqs = store.getTargetFrequencies();
    workletNode.port.postMessage({
      type: 'setTargets',
      frequencies: freqs,
      referenceFreq: store.referenceFreq,
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
    analyserNode.fftSize = 16384;
    analyserNode.smoothingTimeConstant = 0.99;
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

function startPitchDetection() {
  const detect = () => {
    if (!analyserNode || !pitchBuffer || !yinDetector) return;

    const store = useTunerStore.getState();
    if (!store.isRunning || !store.autoDetect) return;

    analyserNode.getFloatTimeDomainData(pitchBuffer as Float32Array<ArrayBuffer>);

    const pitch = yinDetector(pitchBuffer);
    if (pitch && pitch > 20 && pitch < 10000) {
      const note = frequencyToNote(pitch, store.referenceFreq);
      if (note.midi >= 24 && note.midi <= 108) {
        const prevNote = store.currentNote;
        if (!prevNote || prevNote.midi !== note.midi) {
          store.setCurrentNote(note);
          updateWorkletTargets();
        }
      }
    }

    pitchAnimFrame = requestAnimationFrame(detect);
  };

  pitchAnimFrame = requestAnimationFrame(detect);
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

export function setMicGain(value: number): void {
  if (gainNode) gainNode.gain.value = value;
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
