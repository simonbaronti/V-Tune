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
export function ReferenceBar() {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const tolerance = useTunerStore((s) => s.tolerance);
  const autoDetect = useTunerStore((s) => s.autoDetect);
  const harmonicMode = useTunerStore((s) => s.harmonicMode);
  const centsOffset = useTunerStore((s) => s.centsOffset);

  const handleRefChange = (delta: number) => {
    const store = useTunerStore.getState();
    store.setReferenceFreq(store.referenceFreq + delta);
    updateWorkletTargets();
  };

  const handleFineChange = (next: number) => {
    // Round to a tenth: repeated ±0.5 on a float otherwise drifts into
    // values like 2.4999999999999996, which then print as 2.5 but aren't.
    useTunerStore.getState().setCentsOffset(Math.round(next * 10) / 10);
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
            A4
          </span>
          <div className="flex items-center justify-between gap-1">
            {stepperBtn('−', () => handleRefChange(-1))}
            <span
              className="flex-1 text-center text-sm font-medium tabular-nums min-w-0"
              style={{ color: 'var(--text-primary)' }}
            >
              {referenceFreq.toFixed(1)}
            </span>
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

      {/* Row 4 — FINE: sits the target off the 12-TET grid, in cents.
          Shifts every partial together, in both PURE and EQUAL. */}
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className="text-xs text-center tracking-wide"
          style={{ color: 'var(--text-dim)' }}
        >
          FINE
        </span>
        <div className="flex items-center justify-between gap-1">
          {stepperBtn('−', () => handleFineChange(centsOffset - 0.5))}
          <button
            onClick={() => handleFineChange(0)}
            title={
              centsOffset === 0
                ? 'Offset from the selected note, in cents'
                : 'Tap to clear the offset'
            }
            className="flex-1 text-center text-sm font-medium tabular-nums min-w-0 rounded py-1 transition-colors"
            style={{
              background: centsOffset === 0 ? 'transparent' : 'rgba(168, 85, 247, 0.15)',
              color: centsOffset === 0 ? 'var(--text-primary)' : '#a855f7',
              border: `1px solid ${centsOffset === 0 ? 'transparent' : 'rgba(168, 85, 247, 0.4)'}`,
            }}
          >
            {centsOffset > 0 ? '+' : centsOffset < 0 ? '−' : ''}
            {Math.abs(centsOffset).toFixed(1)}¢
          </button>
          {stepperBtn('+', () => handleFineChange(centsOffset + 0.5))}
        </div>
      </div>
    </div>
  );
}
