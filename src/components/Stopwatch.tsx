import { useEffect, useState } from 'react';
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

/**
 * Stopwatch panel. Rendered wherever the layout wants it (above Let's Go on
 * the desktop menu, above the slide-up on mobile) whenever `stopwatchOn` is
 * set by the ⏱ icon in the teal row. The timer itself lives in the store, so
 * it keeps counting across mount/unmount (toggling the panel or switching
 * layouts never loses a running timer).
 */
export function Stopwatch() {
  const running = useTunerStore((s) => s.swRunning);
  const accumulated = useTunerStore((s) => s.swAccumulatedMs);
  const startedAt = useTunerStore((s) => s.swStartedAt);
  const swToggle = useTunerStore((s) => s.swToggle);
  const swReset = useTunerStore((s) => s.swReset);
  const setStopwatchOn = useTunerStore((s) => s.setStopwatchOn);

  const [elapsed, setElapsed] = useState(
    accumulated + (running && startedAt !== null ? performance.now() - startedAt : 0),
  );

  useEffect(() => {
    if (!running) {
      setElapsed(accumulated);
      return;
    }
    let raf = 0;
    const tick = () => {
      const base = startedAt ?? performance.now();
      setElapsed(accumulated + (performance.now() - base));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, accumulated, startedAt]);

  return (
    <div
      data-tour="tour-stopwatch-panel"
      className="shrink-0"
      style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between px-4 pt-2.5">
        <span className="text-xs font-semibold tracking-widest" style={{ color: 'var(--text-dim)' }}>
          STOPWATCH
        </span>
        <button
          onClick={() => setStopwatchOn(false)}
          aria-label="Hide stopwatch"
          className="w-6 h-6 rounded flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-dim)' }}
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 pt-1 pb-3">
        <span
          className="text-3xl font-medium tabular-nums flex-1"
          style={{ color: running ? 'var(--accent-green)' : 'var(--text-primary)' }}
        >
          {formatElapsed(elapsed)}
        </span>
        <button
          onClick={swToggle}
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
          onClick={swReset}
          className="px-3 py-2 rounded text-base font-medium transition-colors"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
