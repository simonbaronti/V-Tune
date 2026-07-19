import { useEffect, useState, type ReactNode } from 'react';
import { useTunerStore } from '../store/tunerStore';

// Piano-style computer-key mapping (see useKeyboardShortcuts). White keys are
// the home/upper letter rows; black keys sit on the row above, just like a
// real keyboard's QWERTY layout maps onto piano keys.
const WHITE = [
  { note: 'C', key: 'A' },
  { note: 'D', key: 'S' },
  { note: 'E', key: 'D' },
  { note: 'F', key: 'F' },
  { note: 'G', key: 'G' },
  { note: 'A', key: 'H' },
  { note: 'B', key: 'J' },
];
const BLACK = [
  { note: 'C#', key: 'W', pos: 1 },
  { note: 'D#', key: 'E', pos: 2 },
  { note: 'F#', key: 'T', pos: 4 },
  { note: 'G#', key: 'Y', pos: 5 },
  { note: 'A#', key: 'U', pos: 6 },
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['↑', '↓'], label: 'Octave up / down' },
  { keys: ['←', '→'], label: 'Nudge cents (Shift = ±10)' },
  { keys: ['0'], label: 'Reset cents to 0' },
  { keys: ['Q'], label: 'Toggle auto-detect' },
  { keys: ['+', '−'], label: 'Reference pitch (A4)' },
  { keys: ['Space'], label: 'Show / hide main menu' },
  { keys: ['Enter'], label: 'Start / stop the tuner' },
  { keys: ['Esc'], label: 'Deselect strobe band' },
];

/** A little keyboard-key badge (keycap). `dark` for use on the black keys. */
function KeyCap({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 5px',
        borderRadius: 5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        background: dark ? 'rgba(255,255,255,0.16)' : 'var(--bg-tertiary)',
        color: dark ? '#fff' : 'var(--text-primary)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.28)' : 'var(--border)'}`,
        boxShadow: '0 1px 0 rgba(0,0,0,0.25)',
      }}
    >
      {children}
    </span>
  );
}

export function KeyboardHelpModal() {
  const open = useTunerStore((s) => s.keyboardHelpOpen);
  const setOpen = useTunerStore((s) => s.setKeyboardHelpOpen);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard map"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))',
        background: 'rgba(0, 0, 0, 0.55)',
        opacity: shown ? 1 : 0,
        transition: 'opacity 180ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col"
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '86vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
          transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            KEYBOARD MAP
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close keyboard map"
            className="w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <span className="text-base leading-none">✕</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-5">
          <p className="text-sm" style={{ color: 'var(--text-secondary)', maxWidth: '52ch' }}>
            With <strong style={{ color: 'var(--text-primary)' }}>auto-detect off</strong>, pick notes mapped on your
            keyboard — the letters are laid out like piano keys, so your fingers already know where they are.
          </p>

          {/* Visual piano map */}
          <div style={{ position: 'relative', height: 154, userSelect: 'none' }}>
            {/* White keys */}
            <div style={{ display: 'flex', height: '100%' }}>
              {WHITE.map((w, i) => (
                <div
                  key={w.note}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(#fcfcff, #e7e8ef)',
                    borderLeft: i ? '1px solid #cfd2dc' : 'none',
                    borderRadius: '0 0 6px 6px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingBottom: 12,
                    gap: 9,
                  }}
                >
                  <KeyCap>{w.key}</KeyCap>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1c24' }}>{w.note}</span>
                </div>
              ))}
            </div>
            {/* Black keys */}
            {BLACK.map((b) => (
              <div
                key={b.note}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${b.pos * (100 / 7)}%`,
                  transform: 'translateX(-50%)',
                  width: '9.2%',
                  height: 96,
                  background: 'linear-gradient(#30323d, #101118)',
                  borderRadius: '0 0 5px 5px',
                  border: '1px solid #000',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingBottom: 8,
                  gap: 7,
                }}
              >
                <KeyCap dark>{b.key}</KeyCap>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#e8e9f0' }}>{b.note}</span>
              </div>
            ))}
          </div>

          {/* Everything else */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="flex items-center gap-1 shrink-0">
                  {s.keys.map((k) => (
                    <KeyCap key={k}>{k}</KeyCap>
                  ))}
                </span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Note keys select a pitch only while auto-detect is off. Space, Enter and the reference-pitch keys work any time.
          </p>
        </div>
      </div>
    </div>
  );
}
