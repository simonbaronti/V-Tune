export interface JIRatio {
  num: number;
  den: number;
  cents: number;
  name: string;
}

export const COMMON_RATIOS: JIRatio[] = [
  { num: 1, den: 1, cents: 0, name: 'Unison' },
  { num: 16, den: 15, cents: 111.7, name: 'Minor 2nd' },
  { num: 9, den: 8, cents: 203.9, name: 'Major 2nd' },
  { num: 6, den: 5, cents: 315.6, name: 'Minor 3rd' },
  { num: 5, den: 4, cents: 386.3, name: 'Major 3rd' },
  { num: 4, den: 3, cents: 498.0, name: 'Perfect 4th' },
  { num: 45, den: 32, cents: 590.2, name: 'Tritone' },
  { num: 3, den: 2, cents: 702.0, name: 'Perfect 5th' },
  { num: 8, den: 5, cents: 813.7, name: 'Minor 6th' },
  { num: 5, den: 3, cents: 884.4, name: 'Major 6th' },
  { num: 9, den: 5, cents: 1017.6, name: 'Minor 7th' },
  { num: 15, den: 8, cents: 1088.3, name: 'Major 7th' },
  { num: 2, den: 1, cents: 1200.0, name: 'Octave' },
  { num: 3, den: 1, cents: 1902.0, name: 'Compound 5th' },
  { num: 4, den: 1, cents: 2400.0, name: '2 Octaves' },
  { num: 5, den: 1, cents: 2786.3, name: 'Compound Maj 3rd' },
  { num: 6, den: 1, cents: 3102.0, name: 'Compound 5th (2 Oct)' },
  { num: 7, den: 1, cents: 3368.8, name: 'Harmonic 7th (2 Oct)' },
  { num: 8, den: 1, cents: 3600.0, name: '3 Octaves' },
];

export function ratioToCents(num: number, den: number): number {
  return 1200 * Math.log2(num / den);
}

export function centsToRatio(cents: number): { num: number; den: number } {
  const ratio = Math.pow(2, cents / 1200);
  const maxDen = 64;
  let bestNum = 1, bestDen = 1, bestErr = Infinity;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(ratio * d);
    const err = Math.abs(n / d - ratio);
    if (err < bestErr) {
      bestErr = err;
      bestNum = n;
      bestDen = d;
    }
  }
  return { num: bestNum, den: bestDen };
}

export function ratioToMultiplier(num: number, den: number): number {
  return num / den;
}

export function formatRatio(num: number, den: number): string {
  return den === 1 ? `${num}` : `${num}/${den}`;
}

export function findClosestRatio(cents: number): JIRatio | null {
  let best: JIRatio | null = null;
  let bestErr = Infinity;
  for (const r of COMMON_RATIOS) {
    const err = Math.abs(r.cents - cents);
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return bestErr < 15 ? best : null;
}
