import type { ReactNode } from 'react';
import { useTunerStore } from '../store/tunerStore';

/** Square icon button used in the teal row. */
function IconBtn({
  onClick,
  active,
  label,
  dataTour,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  dataTour?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-tour={dataTour}
      className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
      style={{
        color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
        background: active ? 'rgba(6, 182, 212, 0.18)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent-cyan)' : 'transparent'}`,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Teal accent row at the top of the slide-out menu (desktop) and inside the
 * mobile slide-up. Hosts the stopwatch toggle, settings-modal trigger and
 * the light/dark theme toggle. Extra controls (pin on mobile) pass through
 * as children, pinned to the right.
 */
export function TealIconRow({ children }: { children?: ReactNode }) {
  const stopwatchOn = useTunerStore((s) => s.stopwatchOn);
  const setStopwatchOn = useTunerStore((s) => s.setStopwatchOn);
  const setSettingsOpen = useTunerStore((s) => s.setSettingsOpen);
  const showSpectrum = useTunerStore((s) => s.showSpectrum);
  const setShowSpectrum = useTunerStore((s) => s.setShowSpectrum);
  const resetIsolationsToDefault = useTunerStore((s) => s.resetIsolationsToDefault);
  const theme = useTunerStore((s) => s.theme);
  const setTheme = useTunerStore((s) => s.setTheme);

  // Toggling the analyser ON always restores the default view — both
  // isolation strobes — so it's never revealed empty, even if the user
  // cleared them earlier.
  const toggleSpectrum = () => {
    const on = !showSpectrum;
    setShowSpectrum(on);
    if (on) resetIsolationsToDefault();
  };

  return (
    <div
      data-tour="tour-utility"
      className="flex items-center gap-1.5 px-2.5 py-2 shrink-0"
      style={{
        background: 'rgba(6, 182, 212, 0.12)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.25)',
      }}
    >
      <IconBtn dataTour="tour-settings" onClick={() => setSettingsOpen(true)} label="Settings">
        {/* Gear icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </IconBtn>

      <IconBtn dataTour="tour-stopwatch" onClick={() => setStopwatchOn(!stopwatchOn)} active={stopwatchOn} label="Stopwatch">
        {/* Stopwatch icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2 2" />
          <path d="M9 2h6" />
          <path d="m19 6-1.5-1.5" />
        </svg>
      </IconBtn>

      <IconBtn
        dataTour="sa-toggle"
        onClick={toggleSpectrum}
        active={showSpectrum}
        label="Spectrum analyser"
      >
        {/* Spectrum / equaliser bars icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="5" y1="19" x2="5" y2="12" />
          <line x1="10" y1="19" x2="10" y2="6" />
          <line x1="15" y1="19" x2="15" y2="14" />
          <line x1="19" y1="19" x2="19" y2="9" />
        </svg>
      </IconBtn>

      <div className="flex-1" />
      {children}

      <IconBtn
        dataTour="tour-theme"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? (
          /* Sun icon */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          /* Moon icon */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </IconBtn>
    </div>
  );
}
