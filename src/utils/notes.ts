const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEGE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const GERMAN_NAMES = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'Ais', 'H'];

export type NoteNaming = 'sharp' | 'flat' | 'solfege' | 'german';

const NAMING_SYSTEMS: Record<NoteNaming, string[]> = {
  sharp: NOTE_NAMES,
  flat: FLAT_NAMES,
  solfege: SOLFEGE_NAMES,
  german: GERMAN_NAMES,
};

export function getDisplayName(noteName: string, naming: NoteNaming): string {
  const idx = NOTE_NAMES.indexOf(noteName);
  if (idx === -1) {
    const flatIdx = FLAT_NAMES.indexOf(noteName);
    if (flatIdx === -1) return noteName;
    return NAMING_SYSTEMS[naming][flatIdx];
  }
  return NAMING_SYSTEMS[naming][idx];
}

export interface NoteInfo {
  name: string;
  flatName: string;
  octave: number;
  midi: number;
  frequency: number;
  centsOff: number;
}

export function frequencyToNote(freq: number, referenceA4 = 440): NoteInfo {
  const semitonesFromA4 = 12 * Math.log2(freq / referenceA4);
  const midi = Math.round(semitonesFromA4) + 69;
  const centsOff = (semitonesFromA4 - Math.round(semitonesFromA4)) * 100;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const exactFreq = referenceA4 * Math.pow(2, (midi - 69) / 12);

  return {
    name: NOTE_NAMES[noteIndex],
    flatName: FLAT_NAMES[noteIndex],
    octave,
    midi,
    frequency: exactFreq,
    centsOff,
  };
}

export function noteToFrequency(noteName: string, octave: number, referenceA4 = 440): number {
  let index = NOTE_NAMES.indexOf(noteName);
  if (index === -1) index = FLAT_NAMES.indexOf(noteName);
  if (index === -1) return referenceA4;
  const midi = (octave + 1) * 12 + index;
  return referenceA4 * Math.pow(2, (midi - 69) / 12);
}

export function centsFromFrequency(actual: number, target: number): number {
  return 1200 * Math.log2(actual / target);
}

export function getHarmonicFrequencies(
  fundamental: number,
  ratios: number[] = [1, 2, 3],
): number[] {
  return ratios.map((r) => fundamental * r);
}

export { NOTE_NAMES, FLAT_NAMES, SOLFEGE_NAMES, GERMAN_NAMES, NAMING_SYSTEMS };
