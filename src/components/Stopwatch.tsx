import { useEffect, useRef, useState } from 'react';
import { useTunerStore } from '../store/tunerStore';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return (
    `${m.toString().padStart(2, '0')}:` +
    `${s.toString().padStart(2, '0')}.` +
    `${cs.toString().padStart(2, '0')}`
  );
}

export function Stopwatch() {
  const open = useTunerStore((s) => s.openAccordion === 'stopwatch');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Persist accumulated time + current start across renders without re-triggering effects
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const startedAt = startedAtRef.current ?? now;
      setElapsed(accumulatedRef.current + (now - startedAt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const handleToggle = () => {
    if (running) {
      // Pause: bank the elapsed time so subsequent start picks up from here
      const now = performance.now();
      accumulatedRef.current += now - (startedAtRef.current ?? now);
      setRunning(false);
    } else {
      startedAtRef.current = performance.now();
      setRunning(true);
    }
  };

  const handleReset = () => {
    accumulatedRef.current = 0;
    startedAtRef.current = null;
    setElapsed(0);
    setRunning(false);
  };

  return (
    <div
      className="shrink-0"
      style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}
    >
      <button
        onClick={() => useTunerStore.getState().toggleAccordion('stopwatch')}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ background: 'transparent', color: 'var(--text-secondary)' }}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            STOPWATCH
          </span>
          {(running || elapsed > 0) && (
            <span
              className="text-sm tabular-nums px-2 py-0.5 rounded"
              style={{
                color: running ? 'var(--accent-green)' : 'var(--text-dim)',
                background: running ? 'rgba(0, 232, 120, 0.12)' : 'var(--bg-tertiary)',
              }}
            >
              {formatElapsed(elapsed)}
            </span>
          )}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span
            className="text-3xl font-medium tabular-nums flex-1"
            style={{ color: running ? 'var(--accent-green)' : 'var(--text-primary)' }}
          >
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={handleToggle}
            className="px-3 py-2 rounded text-base font-medium transition-colors"
            style={{
              background: running ? 'rgba(255, 59, 59, 0.15)' : 'rgba(0, 232, 120, 0.15)',
              color: running ? 'var(--accent-red)' : 'var(--accent-green)',
              border: `1px solid ${running ? 'var(--accent-red)' : 'var(--accent-green)'}`,
            }}
          >
            {running ? 'Stop' : 'Start'}
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded text-base font-medium transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
