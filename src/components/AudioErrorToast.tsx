import { useEffect } from 'react';
import { useTunerStore } from '../store/tunerStore';

/**
 * Transient toast shown when audio fails to start — most commonly "no
 * microphone detected", but also permission-denied and device-in-use.
 * Replaces the old silent no-op where pressing "Let's Go" with no mic did
 * nothing at all. Reads `audioError` from the store, auto-dismisses after a
 * few seconds, and can be tapped to dismiss immediately.
 */
export function AudioErrorToast() {
  const audioError = useTunerStore((s) => s.audioError);

  useEffect(() => {
    if (!audioError) return;
    const t = setTimeout(() => useTunerStore.getState().setAudioError(null), 6000);
    return () => clearTimeout(t);
  }, [audioError]);

  if (!audioError) return null;

  return (
    <div
      role="alert"
      onClick={() => useTunerStore.getState().setAudioError(null)}
      className="fixed left-1/2 z-[100] flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer"
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        background: 'rgba(20, 12, 14, 0.97)',
        border: '1px solid var(--accent-red)',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg
        width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}
        aria-hidden="true"
      >
        {/* Microphone with a slash */}
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 5.12 2.12" />
        <path d="M19 10v1a7 7 0 0 1-.11 1.23" />
        <path d="M5 10v1a7 7 0 0 0 7 7" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </svg>
      <div style={{ minWidth: 0 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {audioError}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
          Tap to dismiss
        </div>
      </div>
    </div>
  );
}
