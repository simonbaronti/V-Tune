/**
 * Strobe drift, in the units strobe tuners have always used.
 *
 * A mechanical strobe tuner's disc appears to rotate at exactly the beat
 * frequency: a note sounding Δf Hz away from its target drifts the pattern
 * Δf revolutions per second, one way for sharp and the other for flat. Speed
 * is the size of the error, direction is its sign — that is the whole
 * reading, and it's why "hold still" means "in tune" to anyone who has used
 * one.
 *
 * `speed` here is therefore a **multiple of a conventional strobe**, which is
 * what other strobe tuners mean by the number — LinoTune calls the same
 * control roll speed and defines it "relative to a conventional strobe". 1 is
 * the real thing; 2 reads twice as lively for the same detuning, which is
 * easier to see on a low note but harder to hold steady.
 *
 * Until now V-Tune added the worklet's per-hop phase error once per animation
 * frame, with no reference to elapsed time:
 *
 *     phase += phaseDelta * 0.5 * strobeSpeed     // once per rAF
 *
 * Two things were wrong with that. The drift came out proportional to the
 * display's refresh rate, so the same note on the same instrument crawled on
 * a 60 Hz phone and ran at double speed on a 120 Hz ProMotion one. And at
 * 60 Hz the result was about a third of a conventional strobe, so every
 * number on the Speed control read low against what a tuner expects —
 * V-Tune's old "3x" was roughly a real strobe's 1x. Hence the feedback
 * asking for faster settings: the fast end wasn't fast, it was normal.
 */

/** Analysis hop, in samples. Must match `hopSize` in the audio worklet —
 *  it's what converts the worklet's per-hop phase error into a rate. */
export const HOP_SIZE = 512;

/**
 * Ceiling on a frame's elapsed time, in seconds.
 *
 * A backgrounded tab gets no animation frames, so the first frame back can
 * report a gap of seconds. Integrating that honestly would snap the pattern
 * through a large, meaningless jump — the instrument wasn't being measured
 * while nobody was looking. Clamping costs a sliver of drift during a stutter
 * and nothing else.
 */
const MAX_FRAME_DT = 0.1;

/** Seconds since the previous frame, clamped and guarded against the first
 *  frame (where there is no previous timestamp). */
export function frameDelta(now: number, prev: number | null): number {
  if (prev === null) return 0;
  return Math.min(MAX_FRAME_DT, Math.max(0, (now - prev) / 1000));
}

/**
 * Radians to advance a strobe pattern this frame, from an error in Hz.
 *
 * At speed 1 this is 2π·Δf·dt — exactly Δf revolutions per second.
 */
export function strobeAdvanceFromHz(
  freqErrorHz: number,
  speed: number,
  dtSeconds: number,
): number {
  return 2 * Math.PI * freqErrorHz * speed * dtSeconds;
}

/**
 * The same advance, from the worklet's per-hop phase error.
 *
 * The worklet reports `phaseDelta = 2π·Δf·HOP_SIZE/sampleRate` — radians of
 * error accumulated over one hop. Multiplying by the hop rate
 * (sampleRate / HOP_SIZE) recovers 2π·Δf, i.e. radians per second at speed 1,
 * without ever needing to turn it back into Hz.
 */
export function strobeAdvanceFromPhaseDelta(
  phaseDeltaPerHop: number,
  sampleRate: number,
  speed: number,
  dtSeconds: number,
): number {
  return phaseDeltaPerHop * (sampleRate / HOP_SIZE) * speed * dtSeconds;
}

/**
 * The Speed control's presets, as multiples of a conventional strobe.
 *
 * 1 is a real strobe and the default. Below it for low notes and fine work,
 * where a conventional strobe already drifts faster than the eye wants;
 * above it to make a small error on a high partial obvious. 10 is the top
 * because that is where LinoTune's roll speed tops out, and matching the
 * scale is the point of using these units at all.
 */
export const STROBE_SPEEDS = [0.5, 1, 2, 5, 10] as const;

/**
 * Convert a Speed saved under the old frame-counted scheme.
 *
 * The old code produced `speed × HOP_SIZE/sampleRate × 0.5 × refreshHz`
 * conventional strobes, ≈ 0.32 × speed on the 48 kHz / 60 Hz case almost
 * everybody was on. A saved 1 is the old default, which nobody chose, so it
 * becomes the new default rather than the 0.5 that would preserve how slowly
 * it happened to run. Anything else was a deliberate choice and keeps its
 * closest equivalent.
 */
export function migrateStrobeSpeed(old: number): number {
  if (!Number.isFinite(old) || old <= 0) return 1;
  if (old === 1) return 1;
  const conventional = old * 0.32;
  return STROBE_SPEEDS.reduce((best, s) =>
    Math.abs(s - conventional) < Math.abs(best - conventional) ? s : best,
  );
}
