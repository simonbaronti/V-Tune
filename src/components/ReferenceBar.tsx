import { useTunerStore } from '../store/tunerStore';
import { updateWorkletTargets } from '../audio/AudioEngine';

/**
 * Top of the TUNING / SCALE accordion: AUTO full-width on its own row,
 * then A4 and TOL beneath it as two equal-width columns.
 *   ┌───────────────────────────────┐
 *   │            AUTO               │
 *   ├───────────────┬───────────────┤
 *   │     A4=       │     TOL       │
 *   │   [- v +]     │   [- v +]     │
 *   └───────────────┴───────────────┘
 */
export function ReferenceBar() {
  const referenceFreq = useTunerStore((s) => s.referenceFreq);
  const tolerance = useTunerStore((s) => s.tolerance);
  const autoDetect = useTunerStore((s) => s.autoDetect);

  const handleRefChange = (delta: number) => {
    const store = useTunerStore.getState();
    store.setReferenceFreq(store.referenceFreq + delta);
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

      {/* Row 2 — A4 and TOL, equal columns */}
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
    </div>
  );
}
