import { useTunerStore } from '../store/tunerStore';
import { updateWorkletTargets } from '../audio/AudioEngine';

/**
 * Top row of the TUNING / SCALE accordion: three equal-width columns,
 * each with a label above its control(s).
 *   ┌─────────┬─────────┬─────────┐
 *   │  AUTO   │   A4=   │   TOL   │
 *   │ [toggle]│ [- v +] │ [- v +] │
 *   └─────────┴─────────┴─────────┘
 * Same internal padding as the old full-width AUTO so the visual weight
 * doesn't change.
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
      className="grid grid-cols-3 gap-2 px-3 py-3 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
    >
      {/* AUTO column — single button labelled "AUTO". items-end so the
          button bottom-aligns with the stepper rows in the other two
          columns despite having no header label of its own. */}
      <div className="flex flex-col justify-end min-w-0">
        <button
          onClick={() => useTunerStore.getState().setAutoDetect(!autoDetect)}
          className="w-full rounded text-sm font-medium transition-colors"
          style={{
            padding: '12px 6px',
            background: autoDetect ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
            color: autoDetect ? '#3b82f6' : 'var(--text-secondary)',
            border: `1px solid ${autoDetect ? '#3b82f6' : 'var(--border)'}`,
          }}
          aria-pressed={autoDetect}
        >
          AUTO
        </button>
      </div>

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
  );
}
