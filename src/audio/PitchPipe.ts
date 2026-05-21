let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let activeFreq: number | null = null;

function ensureContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playTone(frequency: number) {
  if (activeFreq === frequency) {
    stopTone();
    return;
  }

  stopTone();

  const ctx = ensureContext();
  oscillator = ctx.createOscillator();
  gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start();
  activeFreq = frequency;
}

export function stopTone() {
  if (gainNode && oscillator && audioCtx) {
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
    const osc = oscillator;
    setTimeout(() => {
      try { osc.stop(); } catch {}
    }, 60);
  }
  oscillator = null;
  gainNode = null;
  activeFreq = null;
}

export function playBeep(frequency: number, duration = 0.15) {
  const ctx = ensureContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.01);
}

export function isPlaying(): boolean {
  return activeFreq !== null;
}

export function getActiveFreq(): number | null {
  return activeFreq;
}
