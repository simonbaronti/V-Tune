/**
 * Shared "mic liveness" signal for the canvas backgrounds, 0 (quiet) → 1
 * (signal present), already eased. Written every frame by StrobeDisplay
 * (which is always mounted) and read by the Spectrum Analyser + Isolation
 * band canvases, so every neutral background darkens/lightens in sync as the
 * mic picks up or falls quiet — rather than each easing independently and
 * drifting out of step.
 */
export const micLiveness = { value: 0 };

export type Rgba = readonly [number, number, number, number];

/** Linear-interpolate two rgba tuples → css string. t in [0,1]. */
export function mixRgba(a: Rgba, b: Rgba, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  const al = a[3] + (b[3] - a[3]) * t;
  return `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`;
}
