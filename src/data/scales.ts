/**
 * Pre-defined handpan scales. The note names use the sharp convention
 * internally (matches `NOTE_NAMES` in src/utils/notes.ts); display is then
 * adapted to the user's chosen naming system (sharp / flat / solfege /
 * german) via `getDisplayName`.
 *
 * Scale data sourced from opsilon.shop's handpan scales database
 * (https://opsilon.shop/en/pages/scales-database). Treat as a sensible
 * starting set — easy to add more here without touching components.
 */

export interface ScaleNote {
  /** Sharp-form name (C, C#, D, D#, E, F, F#, G, G#, A, A#, B). */
  name: string;
  octave: number;
}

export interface HandpanScale {
  id: string;
  /** Label shown in the dropdown. */
  name: string;
  /** Ordered low → high — includes mutants/bottom notes below the ding. */
  notes: ScaleNote[];
  /** Index into `notes` of the ding (the struck fundamental). For most
   * scales this is 0, but extended scales with "bottom notes" sit below
   * the ding so its index isn't 0. */
  dingIndex: number;
  /** Optional per-scale display override — handpan scales are usually
   * notated using a specific accidental convention (Kurd → flats, Amara →
   * sharps). When set, the scale-mode buttons use this instead of the
   * user's global note-naming preference. */
  naming?: 'sharp' | 'flat';
}

/** Sentinel id meaning "show the full chromatic keyboard". */
export const CHROMATIC_ID = 'chromatic';

export const HANDPAN_SCALES: HandpanScale[] = [
  {
    id: 'd-kurd-11-e5',
    name: 'D Kurd 11 (Ayasa Elements)',
    dingIndex: 0,
    naming: 'flat',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'A',  octave: 3 },
      { name: 'A#', octave: 3 }, // Bb3
      { name: 'C',  octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F',  octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'C',  octave: 5 },
      { name: 'E',  octave: 5 },
    ],
  },
  {
    id: 'd-kurd-13-bottom',
    name: 'D Kurd 13 (Ayasa Elements)',
    dingIndex: 2, // D3, sitting above the two bottom notes Bb2/C3
    naming: 'flat',
    notes: [
      { name: 'A#', octave: 2 }, // Bb2 bottom
      { name: 'C',  octave: 3 }, // C3 bottom
      { name: 'D',  octave: 3 }, // ding
      { name: 'A',  octave: 3 },
      { name: 'A#', octave: 3 }, // Bb3
      { name: 'C',  octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F',  octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'C',  octave: 5 },
      { name: 'D',  octave: 5 },
    ],
  },
  {
    id: 'e-amara-13',
    name: 'E Amara 13 (Ayasa Elements)',
    dingIndex: 0,
    naming: 'sharp',
    notes: [
      { name: 'E',  octave: 3 }, // ding
      { name: 'B',  octave: 3 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G',  octave: 5 },
      { name: 'A',  octave: 5 },
    ],
  },
  {
    id: 'e-amara-20',
    name: 'E Amara 20 (Ayasa Premium)',
    dingIndex: 2, // E3, with C3/D3 sitting below it
    naming: 'sharp',
    notes: [
      { name: 'C',  octave: 3 },
      { name: 'D',  octave: 3 },
      { name: 'E',  octave: 3 }, // ding
      { name: 'F#', octave: 3 },
      { name: 'G',  octave: 3 },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3 },
      { name: 'C',  octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C',  octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G',  octave: 5 },
      { name: 'A',  octave: 5 },
    ],
  },
];

export function findScale(id: string): HandpanScale | null {
  return HANDPAN_SCALES.find((s) => s.id === id) ?? null;
}
