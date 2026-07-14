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
  /** Bottom note (on the underside of the shell). Listed in pitch order like
   * every other note, but flagged so the picker outlines it in teal to set it
   * apart from the ding. A note is either the ding or a bottom note, not both. */
  bottom?: boolean;
  /** Optional label override for the picker, for scales notated against the
   * maker's convention rather than the scale's key (e.g. show "Bb" for the
   * A# in a B-major scale). `name` stays sharp-form for correct pitch. */
  display?: string;
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

const RAW_SCALES: HandpanScale[] = [
  {
    id: 'b-aavartan-17',
    name: 'B2 Aavartan 17',
    dingIndex: 0, // B2 ding
    naming: 'sharp',
    notes: [
      { name: 'B',  octave: 2 }, // ding
      { name: 'C#', octave: 3, bottom: true },
      { name: 'D#', octave: 3 },
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 },
      { name: 'G#', octave: 3 },
      { name: 'A#', octave: 3, display: 'Bb' }, // notated Bb3 by Ayasa
      { name: 'B',  octave: 3 },
      { name: 'C#', octave: 4 },
      { name: 'D#', octave: 4 },
      { name: 'E',  octave: 4, bottom: true },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4, bottom: true },
      { name: 'B',  octave: 4, bottom: true },
      { name: 'C#', octave: 5, bottom: true },
      { name: 'D#', octave: 5, bottom: true },
      { name: 'E',  octave: 5, bottom: true },
    ],
  },
  {
    id: 'b-pygmy-20',
    name: 'B3 Pygmy 20',
    // NOTE: source layout supplied only 19 of the 20 notes — the 20th is still
    // to be added. Kept named "20" intentionally until then.
    dingIndex: 3, // B3 ding, above the three bottom notes
    naming: 'sharp',
    notes: [
      { name: 'F#', octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
      { name: 'A',  octave: 3, bottom: true },
      { name: 'B',  octave: 3 }, // ding
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'D#', octave: 4 },
      { name: 'G',  octave: 4, bottom: true },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5, bottom: true },
      { name: 'F#', octave: 5 },
      { name: 'G',  octave: 5, bottom: true },
      { name: 'A',  octave: 5 },
      { name: 'B',  octave: 5 },
      { name: 'C#', octave: 6 },
      { name: 'D',  octave: 6 },
    ],
  },
  {
    id: 'c-ashakiran-17',
    name: 'C Ashakiran 17',
    dingIndex: 0, // C3 ding
    naming: 'sharp',
    notes: [
      { name: 'C',  octave: 3 }, // ding
      { name: 'D',  octave: 3, bottom: true },
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F',  octave: 3 },
      { name: 'G',  octave: 3 },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3 },
      { name: 'C',  octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F',  octave: 4, bottom: true },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4, bottom: true },
      { name: 'B',  octave: 4, bottom: true },
      { name: 'C',  octave: 5, bottom: true },
      { name: 'D',  octave: 5, bottom: true },
      { name: 'E',  octave: 5, bottom: true },
    ],
  },
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
      { name: 'D',  octave: 5 },
    ],
  },
  {
    id: 'd-kurd-12',
    name: 'D Kurd 12',
    dingIndex: 0, // D3 ding; F3/G3 bottom notes in pitch order
    naming: 'flat',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'F',  octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
      { name: 'A',  octave: 3 },
      { name: 'A#', octave: 3 }, // Bb3
      { name: 'C',  octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F',  octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'C',  octave: 5 },
    ],
  },
  {
    id: 'd-kurd-13',
    name: 'D Kurd 13',
    dingIndex: 0, // D3 ding; F3/G3 bottom notes in pitch order
    naming: 'flat',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'F',  octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
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
    id: 'd-kurd-13-bottom',
    name: 'D Kurd 13 (Ayasa Elements)',
    dingIndex: 0, // D3 ding. F3/G3 are bottom notes but sit in pitch order
                  // (above the ding), flagged with `bottom` for the teal outline.
    naming: 'flat',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'F',  octave: 3, bottom: true }, // F3 bottom
      { name: 'G',  octave: 3, bottom: true }, // G3 bottom
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
    id: 'd-kurd-14',
    name: 'D Kurd 14',
    dingIndex: 0, // D3 ding; F3/G3 bottom notes in pitch order
    naming: 'flat',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'F',  octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
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
      { name: 'E',  octave: 5 },
    ],
  },
  {
    id: 'd-kurd-19',
    name: 'D Kurd 19',
    dingIndex: 2, // D3 ding, above the Bb2/C3 bottom notes
    naming: 'flat',
    notes: [
      { name: 'A#', octave: 2, bottom: true }, // Bb2
      { name: 'C',  octave: 3, bottom: true },
      { name: 'D',  octave: 3 }, // ding
      { name: 'F',  octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
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
      { name: 'E',  octave: 5 },
      { name: 'F',  octave: 5 },
      { name: 'G',  octave: 5, bottom: true },
      { name: 'A',  octave: 5, bottom: true },
    ],
  },
  {
    id: 'd-ashakiran-19',
    name: 'D Ashakiran 19',
    dingIndex: 0, // D3 ding
    naming: 'sharp',
    notes: [
      { name: 'D',  octave: 3 }, // ding
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3, bottom: true },
      { name: 'G',  octave: 3 },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3 },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G',  octave: 4, bottom: true },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C#', octave: 5, bottom: true },
      { name: 'D',  octave: 5, bottom: true },
      { name: 'E',  octave: 5, bottom: true },
      { name: 'F#', octave: 5 },
      { name: 'G',  octave: 5, bottom: true },
      { name: 'A',  octave: 5, bottom: true },
    ],
  },
  {
    id: 'd-aegean-18',
    name: 'D Aegean 18',
    dingIndex: 1, // D3 ding, above the B2 bottom note
    naming: 'sharp',
    notes: [
      { name: 'B',  octave: 2, bottom: true },
      { name: 'D',  octave: 3 }, // ding
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 },
      { name: 'G#', octave: 3, bottom: true },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3, bottom: true },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4, bottom: true },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4, bottom: true },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5, bottom: true },
      { name: 'F#', octave: 5 },
    ],
  },
  {
    id: 'd-aegean-20',
    name: 'D Aegean 20',
    dingIndex: 1, // D3 ding, above the B2 bottom note
    naming: 'sharp',
    notes: [
      { name: 'B',  octave: 2, bottom: true },
      { name: 'D',  octave: 3 }, // ding
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 },
      { name: 'G#', octave: 3, bottom: true },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3, bottom: true },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4, bottom: true },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4, bottom: true },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5, bottom: true },
      { name: 'F#', octave: 5 },
      { name: 'G#', octave: 5 },
      { name: 'A',  octave: 5 },
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
    name: 'E Amara 20',
    dingIndex: 2, // E3 ding, above the C3/D3 bottom notes
    naming: 'sharp',
    notes: [
      { name: 'C',  octave: 3, bottom: true },
      { name: 'D',  octave: 3, bottom: true },
      { name: 'E',  octave: 3 }, // ding
      { name: 'F#', octave: 3, bottom: true },
      { name: 'G',  octave: 3, bottom: true },
      { name: 'A',  octave: 3, bottom: true },
      { name: 'B',  octave: 3 },
      { name: 'C',  octave: 4, bottom: true },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C',  octave: 5, bottom: true },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G',  octave: 5 },
      { name: 'A',  octave: 5 },
    ],
  },
  {
    id: 'f-equinox-17',
    name: 'F Equinox 17',
    dingIndex: 3, // F3 ding, above the C3/Db3/Eb3 bottom notes
    naming: 'flat',
    notes: [
      { name: 'C',  octave: 3, bottom: true },
      { name: 'C#', octave: 3, bottom: true }, // Db3
      { name: 'D#', octave: 3, bottom: true }, // Eb3
      { name: 'F',  octave: 3 }, // ding
      { name: 'G',  octave: 3, bottom: true },
      { name: 'G#', octave: 3 }, // Ab3
      { name: 'A#', octave: 3, bottom: true }, // Bb3
      { name: 'C',  octave: 4 },
      { name: 'C#', octave: 4 }, // Db4
      { name: 'D#', octave: 4 }, // Eb4
      { name: 'F',  octave: 4 },
      { name: 'G',  octave: 4 },
      { name: 'G#', octave: 4 }, // Ab4
      { name: 'C',  octave: 5 },
      { name: 'C#', octave: 5 }, // Db5
      { name: 'D#', octave: 5 }, // Eb5
      { name: 'F',  octave: 5 },
    ],
  },
  {
    id: 'fsharp-nordlys-16',
    name: 'F#2 Nordlys 16',
    dingIndex: 0, // F#2 ding
    naming: 'sharp',
    notes: [
      { name: 'F#', octave: 2 }, // ding
      { name: 'A#', octave: 2, bottom: true },
      { name: 'C#', octave: 3, bottom: true },
      { name: 'F',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 },
      { name: 'G#', octave: 3 },
      { name: 'A#', octave: 3 },
      { name: 'C',  octave: 4 },
      { name: 'C#', octave: 4 },
      { name: 'F',  octave: 4 },
      { name: 'F#', octave: 4, bottom: true },
      { name: 'G#', octave: 4 },
      { name: 'C',  octave: 5 },
      { name: 'C#', octave: 5, bottom: true },
      { name: 'F',  octave: 5, bottom: true },
      { name: 'G#', octave: 5, bottom: true },
    ],
  },
  {
    id: 'fsharp-low-pygmy-12',
    name: 'F# Low Pygmy 12',
    dingIndex: 0, // F#3 ding
    naming: 'sharp',
    notes: [
      { name: 'F#', octave: 3 }, // ding
      { name: 'G#', octave: 3 },
      { name: 'A',  octave: 3 },
      { name: 'C#', octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'C#', octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G#', octave: 5 },
    ],
  },
  {
    id: 'fsharp-low-pygmy-21',
    name: 'F# Low Pygmy 21',
    dingIndex: 2, // F#3 ding, above the D3/E3 bottom notes
    naming: 'sharp',
    notes: [
      { name: 'D',  octave: 3, bottom: true },
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 }, // ding
      { name: 'G#', octave: 3 },
      { name: 'A',  octave: 3 },
      { name: 'B',  octave: 3, bottom: true },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4, bottom: true },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4, bottom: true },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5, bottom: true },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G#', octave: 5 },
      { name: 'A',  octave: 5, bottom: true },
      { name: 'B',  octave: 5, bottom: true },
      { name: 'C#', octave: 6, bottom: true },
    ],
  },
  {
    id: 'fsharp-kurd-20',
    name: 'F# Kurd 20',
    dingIndex: 3, // F#3 ding, above the C#3/D3/E3 bottom notes
    naming: 'sharp',
    notes: [
      { name: 'C#', octave: 3, bottom: true },
      { name: 'D',  octave: 3, bottom: true },
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 }, // ding
      { name: 'G#', octave: 3, bottom: true },
      { name: 'A',  octave: 3, bottom: true },
      { name: 'B',  octave: 3, bottom: true },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G#', octave: 5 },
      { name: 'A',  octave: 5 },
    ],
  },
  {
    id: 'fsharp-kurd-22',
    name: 'F# Kurd 22',
    dingIndex: 3, // F#3 ding, above the B2/D3/E3 bottom notes
    naming: 'sharp',
    notes: [
      { name: 'B',  octave: 2, bottom: true },
      { name: 'D',  octave: 3, bottom: true },
      { name: 'E',  octave: 3, bottom: true },
      { name: 'F#', octave: 3 }, // ding
      { name: 'G#', octave: 3, bottom: true },
      { name: 'A',  octave: 3, bottom: true },
      { name: 'B',  octave: 3, bottom: true },
      { name: 'C#', octave: 4 },
      { name: 'D',  octave: 4 },
      { name: 'E',  octave: 4 },
      { name: 'F#', octave: 4 },
      { name: 'G#', octave: 4 },
      { name: 'A',  octave: 4 },
      { name: 'B',  octave: 4 },
      { name: 'C#', octave: 5 },
      { name: 'D',  octave: 5 },
      { name: 'E',  octave: 5 },
      { name: 'F#', octave: 5 },
      { name: 'G#', octave: 5 },
      { name: 'A',  octave: 5 },
      { name: 'B',  octave: 5 },
      { name: 'C#', octave: 6 },
    ],
  },
];

/**
 * Display order for the scale picker: the three (Ayasa Elements) scales first
 * (kept as intentional alternates), then every other scale in its defined
 * order above.
 */
export const HANDPAN_SCALES: HandpanScale[] = [
  ...RAW_SCALES.filter((s) => s.name.includes('(Ayasa Elements)')),
  ...RAW_SCALES.filter((s) => !s.name.includes('(Ayasa Elements)')),
];

export function findScale(id: string): HandpanScale | null {
  return HANDPAN_SCALES.find((s) => s.id === id) ?? null;
}
