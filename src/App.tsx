import { useState, useEffect } from 'react';
import { StrobeDisplay } from './components/StrobeDisplay';
import { ControlBar } from './components/ControlBar';
import { PitchDial } from './components/PitchDial';
import { BandEditor } from './components/BandEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { Stopwatch } from './components/Stopwatch';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { ReferenceBar } from './components/ReferenceBar';
import { QuickPitchBar } from './components/QuickPitchBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTunerStore } from './store/tunerStore';

function App() {
  useKeyboardShortcuts();
  const showSpectrum = useTunerStore((s) => s.showSpectrum);
  const theme = useTunerStore((s) => s.theme);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Top header — always above the strobe */}
      <header
        className="flex items-center justify-between px-3 py-2 shrink-0 relative z-50"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-bold tracking-wider" style={{ color: 'var(--accent-cyan)' }}>
            V-TUNE
          </span>
          <span className="text-sm hidden sm:inline" style={{ color: 'var(--text-dim)' }}>
            HANDPAN STROBE TUNER
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useTunerStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 rounded flex items-center justify-center transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              // Sun icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              // Moon icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="lg:hidden w-9 h-9 rounded flex items-center justify-center"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--accent-cyan)',
              border: '1px solid var(--border)',
            }}
            aria-label="Toggle settings"
          >
            {panelOpen ? (
              <span className="text-base leading-none">✕</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Main row */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Strobe column */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <StrobeDisplay />
          </div>
          {showSpectrum && <SpectrumAnalyzer />}
          <QuickPitchBar />
        </div>

        {/* Mobile backdrop */}
        {panelOpen && (
          <div
            className="lg:hidden absolute inset-0 z-40"
            style={{ background: 'rgba(0, 0, 0, 0.6)' }}
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* Settings drawer / sidebar */}
        <div
          className={`flex flex-col transition-transform duration-200
            absolute inset-y-0 right-0 z-50 w-[88%] max-w-[420px]
            lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:translate-x-0
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}
        >
          {/* Scrollable region — everything except the fixed footer */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Tuning / Scale accordion */}
            <div
              className="shrink-0"
              style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setTuningOpen(!tuningOpen)}
                className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                style={{ background: 'transparent', color: 'var(--text-secondary)' }}
                aria-expanded={tuningOpen}
              >
                <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  TUNING / SCALE
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
                    transform: tuningOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {tuningOpen && (
                <>
                  <ReferenceBar />
                  <PitchDial />
                </>
              )}
            </div>
            <BandEditor />
            <SettingsPanel />

            {/* Spectrum Analyser toggle */}
            <button
              onClick={() => useTunerStore.getState().setShowSpectrum(!showSpectrum)}
              className="shrink-0 w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--border)',
              }}
              aria-pressed={showSpectrum}
            >
              <span className="text-lg font-semibold tracking-wide">
                SPECTRUM ANALYSER
              </span>
              {/* iOS-style switch */}
              <span
                style={{
                  position: 'relative',
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  background: showSpectrum ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: showSpectrum ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: showSpectrum ? '#fff' : 'var(--text-dim)',
                    transition: 'left 150ms ease, background 150ms ease',
                  }}
                />
              </span>
            </button>
          </div>

          {/* Pinned footer — stopwatch + Let's Go button */}
          <div className="shrink-0">
            <Stopwatch />
            <ControlBar />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
