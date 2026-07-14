/**
 * Shared "mic liveness" signal for the canvas backgrounds, 0 (quiet) → 1
 * (signal present), already eased. Written every frame by StrobeDisplay
 * (which is always mounted) and read by the Spectrum Analyser + Isolation
 * band canvases, so every neutral background darkens/lightens in sync as the
 * mic picks up or falls quiet — rather than each easing independently and
 * drifting out of step.
 */
export const micLiveness = { value: 0 };

/**
 * Phase-rate-refined peak frequency per isolation window, keyed by iso id.
 * The Spectrum Analyser finds each window's rough (bin-limited) peak on the
 * main thread; the audio worklet then refines it with the same Goertzel
 * phase-rate physics the main strobe bands use and writes the sub-cent
 * result here. IsolationBand reads it each frame (falling back to the rough
 * peak until a refined value arrives) — kept off the reactive store so the
 * per-hop updates don't churn React re-renders.
 */
export const isoRefinedFreq: Record<string, number | null> = {};

export type Rgba = readonly [number, number, number, number];

/** Linear-interpolate two rgba tuples → css string. t in [0,1]. */
export function mixRgba(a: Rgba, b: Rgba, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  const al = a[3] + (b[3] - a[3]) * t;
  return `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`;
}
