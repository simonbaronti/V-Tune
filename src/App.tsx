import { useEffect, useRef } from 'react';
import { StrobeDisplay } from './components/StrobeDisplay';
import { ControlBar } from './components/ControlBar';
import { PitchDial } from './components/PitchDial';
import { SettingsPanel } from './components/SettingsPanel';
import { Stopwatch } from './components/Stopwatch';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { IsolationBand } from './components/IsolationBand';
import { ReferenceBar } from './components/ReferenceBar';
import { QuickPitchBar } from './components/QuickPitchBar';
import { OnboardingTour } from './components/OnboardingTour';
import { AudioErrorToast } from './components/AudioErrorToast';
import { UpdateBanner } from './components/UpdateBanner';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTunerStore } from './store/tunerStore';
import { applyAlwaysOnTop, isTauri } from './audio/alwaysOnTop';

function App() {
  useKeyboardShortcuts();
  const showSpectrum = useTunerStore((s) => s.showSpectrum);
  const alwaysOnTop = useTunerStore((s) => s.alwaysOnTop);
  const theme = useTunerStore((s) => s.theme);
  const highContrast = useTunerStore((s) => s.highContrast);
  const largeText = useTunerStore((s) => s.largeText);
  const tuningOpen = useTunerStore((s) => s.openAccordion === 'tuning');
  const panelOpen = useTunerStore((s) => s.panelOpen);
  const setPanelOpen = useTunerStore((s) => s.setPanelOpen);

  // Swipe-to-close: a rightward swipe (the way the drawer exits) closes it.
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onDrawerTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    // Don't hijack swipes that start on a control (sliders drag horizontally)
    if (t.closest('input, select, button')) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onDrawerTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const dx = e.touches[0].clientX - swipeRef.current.x;
    const dy = e.touches[0].clientY - swipeRef.current.y;
    if (dx > 70 && Math.abs(dx) > Math.abs(dy)) {
      setPanelOpen(false);
      swipeRef.current = null;
    }
  };
  const onDrawerTouchEnd = () => {
    swipeRef.current = null;
  };

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
  }, [largeText]);

  // Reflect the persisted always-on-top preference into the Tauri window on
  // mount, and whenever it changes. No-op on web/mobile.
  useEffect(() => {
    if (!isTauri()) return;
    applyAlwaysOnTop(alwaysOnTop);
  }, [alwaysOnTop]);

  // First-run onboarding: kick off the tour once on mount if the user
  // hasn't dismissed it before. `tourActive` is also flipped by the
  // "Show tour again" button in Settings.
  useEffect(() => {
    const s = useTunerStore.getState();
    if (!s.onboardingDone && !s.tourActive) {
      s.setTourActive(true);
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close any open accordion after 10s of no interaction inside the
  // side panel. Activity in the main strobe area doesn't count — only
  // pointer / keyboard / wheel events whose target sits inside the
  // [data-side-panel] subtree reset the timer. Disabled while the tour
  // is running so it can't fight the orchestration.
  const openAccordion = useTunerStore((s) => s.openAccordion);
  const tourActive = useTunerStore((s) => s.tourActive);
  useEffect(() => {
    if (!openAccordion || tourActive) return;
    // Stopwatch stays open until the user explicitly closes it — running
    // timers shouldn't disappear behind your back.
    if (openAccordion === 'stopwatch') return;
    // Desktop has plenty of room for an open accordion alongside the
    // strobe, so the auto-close is just annoying there. Restrict to
    // mobile/tablet, where the panel covers content and users open it
    // via the burger anyway — a closed default makes sense.
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    const TIMEOUT_MS = 10_000;
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => {
        // Re-read fresh in case the accordion changed since arm()
        const cur = useTunerStore.getState().openAccordion;
        if (cur) useTunerStore.getState().toggleAccordion(cur);
      }, TIMEOUT_MS);
    };
    const inPanel = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return target.closest('[data-side-panel]') !== null;
    };
    const onEvent = (e: Event) => {
      if (inPanel(e.target)) arm();
    };
    arm(); // start the clock the moment the accordion opens
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    for (const ev of events) document.addEventListener(ev, onEvent, true);
    return () => {
      if (t !== null) clearTimeout(t);
      for (const ev of events) document.removeEventListener(ev, onEvent, true);
    };
  }, [openAccordion, tourActive]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative">
      <OnboardingTour />
      <AudioErrorToast />
      <UpdateBanner />
      {/* Top header — always above the strobe. iOS PWA runs in
          black-translucent mode (content extends under the notch / status
          bar), so we pad the top + sides with the safe-area insets so the
          burger / theme toggle never end up behind the wifi/battery icons. */}
      <header
        className="flex items-center justify-between pb-2 shrink-0 relative z-50"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            data-tour="welcome"
            className="text-lg font-bold tracking-wider"
            style={{ color: 'var(--accent-cyan)' }}
          >
            V-TUNE
          </span>
          <span className="text-sm hidden sm:inline" style={{ color: 'var(--text-dim)' }}>
            HANDPAN STROBE TUNER
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-tour="theme-toggle"
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
            data-tour="burger"
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
        {/* Canvas column — strobe on top, spectrum analyser (when toggled)
            below it, quick pitch bar pinned at the bottom on mobile. */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <StrobeDisplay />
          </div>
          {showSpectrum && (
            <>
              <SpectrumAnalyzer />
              <IsolationBand />
            </>
          )}
          <QuickPitchBar />
        </div>

        {/* Backdrop — only on small viewports (drawer is overlay there) */}
        {panelOpen && (
          <div
            className="lg:hidden absolute inset-0 z-40"
            style={{ background: 'rgba(0, 0, 0, 0.6)' }}
            onClick={() => setPanelOpen(false)}
          />
        )}

        {/* Settings panel — slide-out on small viewports, always-visible
            sidebar at lg+ (desktop & tablet landscape). */}
        <div
          data-side-panel
          className={`flex flex-col transition-transform duration-200
            absolute inset-y-0 right-0 z-50 w-[88%] max-w-[420px]
            lg:static lg:z-auto lg:w-[420px] lg:max-w-none lg:translate-x-0
            ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}
          style={{
            background: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border)',
            // Safe-area padding for the bottom (home indicator, under the
            // SA toggle) and right (landscape notch). NOT the top: the
            // drawer sits below the header, which already pads the top
            // safe-area inset — adding it here too pushed the "Let's Go"
            // button down by a second notch-height of empty space.
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
          onTouchStart={onDrawerTouchStart}
          onTouchMove={onDrawerTouchMove}
          onTouchEnd={onDrawerTouchEnd}
        >
          {/* Pinned top — Let's Go / Stop */}
          <div className="shrink-0">
            <ControlBar />
          </div>

          {/* Scrollable region — accordions */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Tuning / Scale accordion */}
            <div
              className="shrink-0"
              style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)' }}
            >
              <button
                data-tour="tuning-header"
                onClick={() => useTunerStore.getState().toggleAccordion('tuning')}
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
            <SettingsPanel />
          </div>

          {/* Pinned footer — stopwatch + spectrum / pitch-graph toggles */}
          <div className="shrink-0">
            <Stopwatch />
            <FooterToggle
              dataTour="sa-toggle"
              label="SPECTRUM ANALYSER"
              value={showSpectrum}
              onChange={(v) => useTunerStore.getState().setShowSpectrum(v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable iOS-style toggle row used in the pinned footer for the two
 * canvas-area panels (spectrum analyser, pitch graph). Same look as the
 * old inline button so the visual rhythm doesn't change.
 */
function FooterToggle({
  label,
  value,
  onChange,
  dataTour,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  dataTour?: string;
}) {
  return (
    <button
      data-tour={dataTour}
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between px-4 py-3 transition-colors"
      style={{
        background: 'var(--bg-panel)',
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border)',
      }}
      aria-pressed={value}
    >
      <span className="text-lg font-semibold tracking-wide">{label}</span>
      <span
        style={{
          position: 'relative',
          width: 38,
          height: 22,
          borderRadius: 999,
          background: value ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          transition: 'background 150ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: value ? '#fff' : 'var(--text-dim)',
            transition: 'left 150ms ease, background 150ms ease',
          }}
        />
      </span>
    </button>
  );
}

export default App;
