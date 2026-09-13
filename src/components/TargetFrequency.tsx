/**
 * CUSTOM — the tuning target in hertz, typed directly or nudged a cent at a
 * time.
 *
 * This replaces two controls that were really one. FINE set a cents offset
 * with a stepper; the Hz field set the same offset by typing a frequency and
 * splitting it into nearest-note-plus-remainder. Both wrote `centsOffset`,
 * both painted themselves purple when it wasn't zero, and they lived in
 * different panels — FINE beside A4 and Tolerance, the Hz field down by the
 * note picker. On a phone FINE was buried in Settings and couldn't be reached
 * while tuning at all, which is why the strobe needed its own purple chip to
 * hint that an offset was in play.
 *
 * One field does both jobs. Type when you know the number — a maker's spec
 * sheet, an instrument you've measured before. Nudge when you don't, and
 * you're creeping up on it by eye with the strobe running. Hertz is also the
 * friendlier unit to put in front of someone who just wants to tune a
 * handpan: it's printed on every spec sheet, where cents are jargon.
 *
 * It sits in its own tinted band, full width, below the note grid — a target
 * set here overrides what the grid says, and that's worth making obvious
 * rather than leaving it to look like one more field among the rest.
 */
import { useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { frequencyToNote, getDisplayName, formatHz } from '../utils/notes';
import { updateWorkletTargets } from '../audio/AudioEngine';

// The range the analyser itself covers — offering more would be a lie.
const MIN_HZ = 20;
const MAX_HZ = 5000;

// Matches the step the old FINE stepper used. Cents rather than hertz so the
// nudge is the same musical distance wherever you are on the instrument.
const STEP_CENTS = 0.5;

const PURPLE = '#a855f7';

type Props = {
  /** Horizontal padding of the container, so the band can bleed through it
   *  to the panel edges. Left and right are separate because a phone's safe
   *  area isn't symmetrical in landscape. */
  bleedLeft?: string;
  bleedRight?: string;
};

export function TargetFrequency({ bleedLeft = '0px', bleedRight = '0px' }: Props) {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const baseFrequency = useTunerStore((s) => s.baseFrequency);
  const centsOffset = useTunerStore((s) => s.centsOffset);
  const currentNote = useTunerStore((s) => s.currentNote);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const noteNaming = useTunerStore((s) => s.noteNaming);

  // `null` means "not being edited" — the field then simply mirrors the live
  // target. Holding the displayed value in state instead would need an effect
  // to push every external change back into it.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offset = centsOffset !== 0;
  // Full precision is for a target someone set — it's their number and the
  // digits are the point. A default is just the note's standard pitch, and
  // showing D#4 as 311.127 makes the field look like it's already been
  // fiddled with when it hasn't. Two places there, matching how the strobe
  // bands treat the same distinction.
  const shown = offset ? formatHz(baseFrequency) : baseFrequency.toFixed(2);
  const dirty = draft !== null && draft.trim() !== '' && draft.trim() !== shown;
  // Purple the moment you start typing, not only once it's committed — the
  // field should look like it's yours while you're still deciding, the same
  // way it does afterwards. Otherwise the colour lags a keystroke behind the
  // intent and the change of state reads as a surprise rather than a
  // confirmation.
  const custom = offset || dirty;

  const apply = () => {
    if (draft === null) return;
    // Accept a comma as the decimal separator — most of Europe types that.
    const hz = parseFloat(draft.trim().replace(',', '.'));
    if (!isFinite(hz) || hz < MIN_HZ || hz > MAX_HZ) {
      setError(`Enter a frequency between ${MIN_HZ} and ${MAX_HZ} Hz.`);
      return;
    }
    setError(null);

    const note = frequencyToNote(hz, referenceFreq);
    const store = useTunerStore.getState();
    // `note.frequency` is the nearest note's exact equal-tempered pitch and
    // `note.centsOff` is how far the typed value sits from it. Setting both
    // lands the target precisely on what was typed.
    store.setCurrentNote({ ...note, centsOff: 0 });
    store.setCentsOffset(note.centsOff);
    updateWorkletTargets();
    setDraft(null);
  };

  const nudge = (delta: number) => {
    const store = useTunerStore.getState();
    // Round to a tenth: repeated ±0.5 on a float otherwise drifts into values
    // like 2.4999999999999996, which then print as 2.5 but aren't.
    store.setCentsOffset(Math.round((store.centsOffset + delta) * 10) / 10);
    updateWorkletTargets();
    setDraft(null);
    setError(null);
  };

  const reset = () => {
    useTunerStore.getState().setCentsOffset(0);
    updateWorkletTargets();
    setDraft(null);
    setError(null);
  };

  const stepBtn = (label: string, delta: number, title: string) => (
    <button
      onClick={() => nudge(delta)}
      disabled={autoDetect}
      title={title}
      aria-label={title}
      className="w-9 h-9 rounded text-base flex items-center justify-center transition-colors shrink-0"
      style={{
        background: 'var(--bg-tertiary)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        opacity: autoDetect ? 0.3 : 1,
      }}
    >
      {label}
    </button>
  );

  const noteLabel = currentNote
    ? `${getDisplayName(currentNote.name, noteNaming)}${currentNote.octave}`
    : (() => {
        const n = frequencyToNote(baseFrequency, referenceFreq);
        return `${getDisplayName(n.name, noteNaming)}${n.octave}`;
      })();

  return (
    <div
      style={{
        marginLeft: `calc(-1 * ${bleedLeft})`,
        marginRight: `calc(-1 * ${bleedRight})`,
        paddingLeft: bleedLeft,
        paddingRight: bleedRight,
        paddingTop: '0.75rem',
        paddingBottom: '0.75rem',
        // Breathing room from the row above, outside the band, so the tint
        // starts clear of the note grid rather than crowding it.
        marginTop: '10px',
        background: 'var(--bg-custom)',
        borderTop: '1px solid var(--border-custom)',
        borderBottom: '1px solid var(--border-custom)',
        opacity: autoDetect ? 0.5 : 1,
      }}
    >
      {/* A grid rather than stacked flex rows, so the hint sits in the same
          column as the field it describes and is genuinely centred over it —
          lining it up by eye with padding would drift the moment the − / +
          buttons or the "Hz" label changed size. */}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: 'auto auto 1fr auto', columnGap: '0.375rem', rowGap: '0.375rem' }}
      >
        <span
          className="text-xs tracking-widest shrink-0"
          style={{ gridColumn: 'span 2', color: 'var(--text-dim)' }}
        >
          CUSTOM
        </span>
        <span
          className="text-[10px] leading-snug truncate text-center"
          style={{ color: 'var(--text-dim)' }}
        >
          {/* "the desired target" overran its column by 8px once the mobile
              picker scaled up, and an ellipsis mid-hint is worse than one
              fewer filler word. */}
          Type to set the target Hz
        </span>
        {/* Keeps the hint out of the + button's column. */}
        <span aria-hidden />

        <span className="text-xs tracking-wider shrink-0" style={{ color: 'var(--text-dim)' }}>
          Hz
        </span>

        {stepBtn('−', -STEP_CENTS, `Down ${STEP_CENTS} cents`)}

        <div className="relative min-w-0">
          <input
            type="text"
            inputMode="decimal"
            value={draft ?? shown}
            disabled={autoDetect}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
              if (e.key === 'Escape') {
                setDraft(null);
                setError(null);
              }
            }}
            // The iOS decimal keypad has no return key, so tapping away has
            // to commit — otherwise a typed frequency would be unreachable on
            // a phone, which is where most of this app gets used.
            onBlur={() => {
              if (dirty) apply();
              else setDraft(null);
            }}
            aria-label="Target frequency in hertz"
            // text-base is load-bearing, not cosmetic: iOS zooms the whole
            // page in when you focus an input whose font-size is under 16px,
            // and doesn't reliably zoom back out afterwards — the app is left
            // stranded at 1.3x with no way back. 16px is the threshold.
            // The panel's zoom doesn't count towards it; iOS reads the
            // computed size, which was 14px.
            className="w-full rounded px-2 py-1.5 text-base text-center tabular-nums"
            style={{
              background: 'var(--bg-tertiary)',
              // Dim until it's actually yours. The standard pitch for the
              // selected note is a default the field is showing you, not a
              // value you set, so it reads like placeholder text — which
              // leaves purple to mean one thing only: this target has been
              // moved off the note.
              color: custom ? PURPLE : 'var(--text-dim)',
              border: `1px solid ${custom ? 'rgba(168, 85, 247, 0.4)' : 'var(--border)'}`,
              paddingRight: dirty ? '2.75rem' : undefined,
            }}
          />
          {dirty && (
            // Only while there's something to commit, so the resting state
            // stays uncluttered. onMouseDown, because onBlur fires first and
            // would otherwise apply and hide the button out from under the tap.
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                apply();
              }}
              className="absolute right-1 top-1/2 rounded px-2 py-1 text-[10px] font-semibold tracking-wide"
              style={{
                transform: 'translateY(-50%)',
                background: 'rgba(168, 85, 247, 0.15)',
                color: PURPLE,
                border: '1px solid rgba(168, 85, 247, 0.4)',
              }}
            >
              SET
            </button>
          )}
        </div>

        {stepBtn('+', STEP_CENTS, `Up ${STEP_CENTS} cents`)}

        <span
          className="text-[10px] leading-snug"
          style={{ gridColumn: '1 / -1', color: 'var(--text-dim)' }}
        >
        {error ? (
          error
        ) : autoDetect ? (
          'Turn AUTO off to set a target by frequency.'
        ) : offset ? (
          <>
            {noteLabel}{' '}
            <span style={{ color: PURPLE }}>
              {centsOffset > 0 ? '+' : '−'}
              {/* A typed frequency can land a hundredth of a cent off the
                  note, and a tenth-of-a-cent readout renders that as "0.0"
                  — a purple field insisting the offset is zero. Show the
                  extra digit only when it's the difference between a number
                  and a contradiction. */}
              {Math.abs(centsOffset) < 0.1
                ? Math.abs(centsOffset).toFixed(2)
                : Math.abs(centsOffset).toFixed(1)}
              ¢
            </span>{' '}
            ·{' '}
            <button onClick={reset} className="underline" style={{ color: 'var(--text-dim)' }}>
              reset
            </button>
          </>
        ) : (
          `Nearest note ${noteLabel}`
        )}
        </span>
      </div>
    </div>
  );
}
