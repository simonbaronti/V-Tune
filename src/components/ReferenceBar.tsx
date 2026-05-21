import { useTunerStore } from '../store/tunerStore';
import { updateWorkletTargets } from '../audio/AudioEngine';

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
      className="w-8 h-8 rounded text-base flex items-center justify-center transition-colors"
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
      className="flex flex-col gap-3 px-3 py-3 shrink-0"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Row 1: full-width AUTO toggle */}
      <button
        onClick={() => useTunerStore.getState().setAutoDetect(!autoDetect)}
        className="w-full rounded text-base font-medium transition-colors"
        style={{
          padding: '26px 12px',
          background: autoDetect ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary)',
          color: autoDetect ? '#3b82f6' : 'var(--text-secondary)',
          border: `1px solid ${autoDetect ? '#3b82f6' : 'var(--border)'}`,
        }}
      >
        AUTO
      </button>

      {/* Row 2: A₄ + TOL steppers */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>A₄</span>
          {stepperBtn('−', () => handleRefChange(-1))}
          <span
            className="text-base text-center font-medium tabular-nums"
            style={{ color: 'var(--text-primary)', minWidth: '4.5rem' }}
          >
            {referenceFreq.toFixed(1)} Hz
          </span>
          {stepperBtn('+', () => handleRefChange(1))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-sm" style={{ color: 'var(--text-dim)' }}>TOL</span>
          {stepperBtn('−', () => useTunerStore.getState().setTolerance(Math.max(0.5, tolerance - 0.5)))}
          <span
            className="text-base text-center font-medium tabular-nums"
            style={{ color: 'var(--text-primary)', minWidth: '3.2rem' }}
          >
            {tolerance.toFixed(1)}¢
          </span>
          {stepperBtn('+', () => useTunerStore.getState().setTolerance(Math.min(10, tolerance + 0.5)))}
        </div>
      </div>
    </div>
  );
}
