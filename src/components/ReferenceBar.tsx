import { useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { updateWorkletTargets } from '../audio/AudioEngine';

/**
 * Top of the TUNING / SCALE accordion: AUTO full-width on its own row,
 * then a PURE/EQUAL reference toggle, then A4 and TOL as two columns.
 *   ┌───────────────────────────────┐
 *   │            AUTO               │
 *   ├───────────────┬───────────────┤
 *   │     PURE      │     EQUAL     │
 *   ├───────────────┼───────────────┤
 *   │     A4=       │     TOL       │
 *   │   [- v +]     │   [- v +]     │
 *   └───────────────┴───────────────┘
 */
/** Sane bounds for a concert-pitch reference. Wide enough for every
 *  historical pitch a maker might work to, narrow enough that a typo can't
 *  silently put the whole instrument an octave out. */
const MIN_REF_HZ = 300;
const MAX_REF_HZ = 600;

export function ReferenceBar() {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const tolerance = useTunerStore((s) => s.tolerance);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const harmonicMode = useTunerStore((s) => s.harmonicMode);

  // Typed entry as well as the steppers. Eight presses of − to reach 432 was
  // its own argument for typing the number, and the number you type here is
  // now the *only* thing that sets the reference: the old CUSTOM "type the
  // target Hz" box quietly stored a second, invisible cents offset on top of
  // this one, so A4 could read 432.0 while every target sat at 440. It is
  // gone, and this field is what replaces it.
  // null while the field simply mirrors the store; a string while the user
  // is mid-type, so their keystrokes aren't fought by a re-render.
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Commit whatever is actually in the field.
   *
   * Read from the DOM rather than from React state: the keystroke that ends
   * an edit (Enter, or a tap elsewhere) can arrive in the same batch as the
   * change that produced the value, and a commit that reads a stale `draft`
   * silently does nothing. On this control, "silently does nothing" is the
   * entire bug we are here to fix.
   *
   * Escape is handled by putting the stored value back in the field before
   * blurring, so the commit that follows is simply a no-op. An earlier
   * version set an "abandon" flag instead — and if the blur never arrived,
   * the flag sat there and swallowed the NEXT edit the user made. One
   * invisible piece of sticky state is what caused this release.
   */
  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(MAX_REF_HZ, Math.max(MIN_REF_HZ, parsed));
    const store = useTunerStore.getState();
    if (clamped === store.referenceFreq) return;
    store.setReferenceFreq(clamped);
    updateWorkletTargets();
  };

  const handleRefChange = (delta: number) => {
    const store = useTunerStore.getState();
    const next = Math.min(MAX_REF_HZ, Math.max(MIN_REF_HZ, store.referenceFreq + delta));
    setDraft(null);
    store.setReferenceFreq(next);
    updateWorkletTargets();
  };

  const handleModeChange = (mode: 'pure' | 'equal') => {
    const store = useTunerStore.getState();
    if (store.harmonicMode === mode) return;
    store.setHarmonicMode(mode);
    updateWorkletTargets();
  };

  const stepperBtn = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded text-base flex items-center justify-center transition-colors shrink-0"
      style={{
        background: 'var(--bg-tertiary)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      data-tour="tour-tuning"
      className="flex flex-col gap-2 px-3 py-3 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Row 1 — AUTO button, full width */}
      <button
        onClick={() => useTunerStore.getState().setAutoDetect(!autoDetect)}
        className="w-full rounded text-sm font-medium transition-colors"
        style={{
          padding: '10px 6px',
          background: autoDetect ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
          color: autoDetect ? '#3b82f6' : 'var(--text-secondary)',
          border: `1px solid ${autoDetect ? '#3b82f6' : 'var(--border)'}`,
        }}
        aria-pressed={autoDetect}
      >
        AUTO
      </button>

      {/* Row 2 — PURE / EQUAL reference toggle. PURE references each
          foundation band against n × the fundamental (a perfectly-tuned
          handpan reads 0 on every partial); EQUAL references against the
          nearest equal-tempered note (compound 5th reads ~+2¢ on a pure
          handpan). Segmented control, two halves. */}
      <div
        className="grid grid-cols-2 rounded overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
        role="group"
        aria-label="Tuning reference"
      >
        {(['pure', 'equal'] as const).map((mode) => {
          const active = harmonicMode === mode;
          return (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className="text-xs font-semibold tracking-wide uppercase transition-colors"
              style={{
                padding: '7px 6px',
                background: active ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-tertiary)',
                color: active ? '#a855f7' : 'var(--text-dim)',
                borderLeft: mode === 'equal' ? '1px solid var(--border)' : 'none',
              }}
              aria-pressed={active}
              title={
                mode === 'pure'
                  ? 'Pure harmonics — partials referenced against n × the fundamental'
                  : 'Equal temperament — partials referenced against the nearest ET note'
              }
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Row 3 — A4 and TOL, equal columns */}
      <div className="grid grid-cols-2 gap-2">
        {/* A4 column — title above, value flanked by − / + below */}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="text-xs text-center tracking-wide"
            style={{ color: 'var(--text-dim)' }}
          >
            A4 = Hz
          </span>
          <div className="flex items-center justify-between gap-1">
            {stepperBtn('−', () => handleRefChange(-1))}
            <input
              type="text"
              inputMode="decimal"
              aria-label="Reference pitch, A4 in hertz"
              value={draft ?? referenceFreq.toFixed(1)}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => {
                setDraft(referenceFreq.toFixed(1));
                e.target.select();
              }}
              onBlur={(e) => commit(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') {
                  e.currentTarget.value = referenceFreq.toFixed(1);
                  e.currentTarget.blur();
                }
              }}
              // 16px, or iOS zooms the page on focus and leaves it there.
              className="flex-1 text-center text-base font-medium tabular-nums min-w-0 rounded"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                padding: '4px 2px',
              }}
            />
            {stepperBtn('+', () => handleRefChange(1))}
          </div>
        </div>

        {/* TOL column — title above, value flanked by − / + below */}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="text-xs text-center tracking-wide"
            style={{ color: 'var(--text-dim)' }}
          >
            TOL
          </span>
          <div className="flex items-center justify-between gap-1">
            {stepperBtn('−', () => useTunerStore.getState().setTolerance(Math.max(0.5, tolerance - 0.5)))}
            <span
              className="flex-1 text-center text-sm font-medium tabular-nums min-w-0"
              style={{ color: 'var(--text-primary)' }}
            >
              {tolerance.toFixed(1)}¢
            </span>
            {stepperBtn('+', () => useTunerStore.getState().setTolerance(Math.min(10, tolerance + 0.5)))}
          </div>
        </div>
      </div>

      {/* Said out loud, because the thing that caused a handpan to be tuned
          to the wrong pitch was a second reference the user could not see. */}
      <span className="text-[10px] text-center leading-tight" style={{ color: 'var(--text-dim)' }}>
        Every target is built from this number — nothing else changes it.
      </span>
    </div>
  );
}
