/**
 * Gu-port helpers.
 *
 * Some scales list the one or two notes tuned into the Gu opening on the
 * underside of the shell (see `guPort` in src/data/scales.ts). They aren't
 * playable targets, so they never appear in the note picker — but they still
 * need checking, which means putting the spectrum analyser's isolation
 * windows on them and reading the resulting strobe bands.
 *
 * This module turns those label strings ("E5", "Bb5") into the frequency
 * windows and the analyser view range that the Gu-port chip applies.
 */
import { noteToFrequency } from './notes';

/**
 * Half-width of each Gu-port isolation window, in cents.
 *
 * Wide enough to still catch a port that's meaningfully out — the whole
 * point of looking is that it needs work — while staying narrow enough that
 * nothing else in the shell wanders into the bracket. A tighter window
 * (±20) would go blank exactly when the note is most in need of attention.
 */
export const GU_PORT_CENTS = 35;

const CENT_RATIO = (cents: number) => Math.pow(2, cents / 1200);

/** "E5" / "Bb5" / "F#3" → note name + octave, or null if unparseable. */
export function parseGuPortNote(label: string): { name: string; octave: number } | null {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(label.trim());
  if (!m) return null;
  return { name: m[1], octave: parseInt(m[2], 10) };
}

export interface GuPortTarget {
  /** Verbatim label from the scale data ("E5", "Bb5"). */
  label: string;
  freq: number;
}

/**
 * Gu-port labels → targets at the current reference pitch, sorted low →
 * high and with anything unparseable dropped. Ascending order is what ties
 * each note to its colour slot (teal, then purple) all the way through:
 * chip label, analyser bracket, strobe band.
 */
export function guPortTargets(
  guPort: string[] | undefined,
  referenceA4: number,
): GuPortTarget[] {
  if (!guPort) return [];
  const out: GuPortTarget[] = [];
  for (const label of guPort) {
    const parsed = parseGuPortNote(label);
    if (parsed) {
      out.push({ label, freq: noteToFrequency(parsed.name, parsed.octave, referenceA4) });
    }
  }
  return out.sort((a, b) => a.freq - b.freq);
}

/**
 * One ±GU_PORT_CENTS window per frequency, sorted low → high.
 *
 * The sort matters: window order decides the colour slot (teal, then
 * purple), so ascending keeps the leftmost bracket on the analyser and the
 * leftmost strobe band the same colour — the same convention the default
 * windows use. Scales are free to list their Gu notes in any order.
 */
export function guPortWindows(freqs: number[]): Array<[number, number]> {
  const lo = CENT_RATIO(-GU_PORT_CENTS);
  const hi = CENT_RATIO(GU_PORT_CENTS);
  return [...freqs]
    .sort((a, b) => a - b)
    .map((f) => [f * lo, f * hi] as [number, number]);
}

// Analyser view padding, in log10-frequency units: ~7% of headroom either
// side of the outermost bracket, and a floor on the total span so a single
// Gu note doesn't zoom in so far that there's no context around it.
const VIEW_PAD_LOG = 0.03;
const MIN_VIEW_HALF_LOG = 0.06;

/**
 * View range that frames every Gu-port window with a little air around it,
 * so both brackets — and where the peak is floating inside them — are
 * comfortably readable.
 */
export function guPortViewRange(windows: Array<[number, number]>): [number, number] | null {
  if (windows.length === 0) return null;
  const logLo = Math.log10(Math.min(...windows.map((w) => w[0])));
  const logHi = Math.log10(Math.max(...windows.map((w) => w[1])));
  const mid = (logLo + logHi) / 2;
  const half = Math.max((logHi - logLo) / 2 + VIEW_PAD_LOG, MIN_VIEW_HALF_LOG);
  return [Math.pow(10, mid - half), Math.pow(10, mid + half)];
}

/** True when the live isolation windows are (still) the Gu-port ones. */
export function isGuPortArmed(
  isolations: Array<{ minFreq: number; maxFreq: number }>,
  windows: Array<[number, number]>,
): boolean {
  if (windows.length === 0 || isolations.length !== windows.length) return false;
  return windows.every((w, i) =>
    Math.abs(isolations[i].minFreq - w[0]) < 0.5 &&
    Math.abs(isolations[i].maxFreq - w[1]) < 0.5,
  );
}
