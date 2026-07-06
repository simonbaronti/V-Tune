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
 * Compact stopwatch readout for the header — shown on the wide layout when
 * the slide-out menu is hidden but the stopwatch is still on, so a running
 * session stays visible. Tapping it re-opens the menu (to pause / reset).
 * The timer lives in the store, so this just renders it.
 */
export function StopwatchChip() {
  const running = useTunerStore((s) => s.swRunning);
  const accumulated = useTunerStore((s) => s.swAccumulatedMs);
  const startedAt = useTunerStore((s) => s.swStartedAt);
  const setMenuOpen = useTunerStore((s) => s.setMenuOpen);

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
    <button
      onClick={() => setMenuOpen(true)}
      title="Stopwatch — open menu to control"
      aria-label="Stopwatch, open menu to control"
      className="flex items-center gap-1.5 h-9 px-2.5 rounded transition-colors"
      style={{
        background: 'var(--bg-tertiary)',
        border: `1px solid ${running ? 'var(--accent-green)' : 'var(--border)'}`,
        color: running ? 'var(--accent-green)' : 'var(--text-secondary)',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </svg>
      <span className="text-sm tabular-nums font-medium">{formatElapsed(elapsed)}</span>
    </button>
  );
}
