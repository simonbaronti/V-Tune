import { useEffect, useState } from 'react';
import { StrobeDisplay } from './components/StrobeDisplay';
import { ControlBar } from './components/ControlBar';
import { PitchDial } from './components/PitchDial';
import { ReferenceBar } from './components/ReferenceBar';
import { Stopwatch } from './components/Stopwatch';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { IsolationBand } from './components/IsolationBand';
import { QuickPitchBar } from './components/QuickPitchBar';
import { TealIconRow } from './components/TealIconRow';
import { StopwatchChip } from './components/StopwatchChip';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingTour } from './components/OnboardingTour';
import { AudioErrorToast } from './components/AudioErrorToast';
import { UpdateBanner } from './components/UpdateBanner';
import { DesktopUpdater } from './components/DesktopUpdater';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTunerStore } from './store/tunerStore';

/** Width of the desktop / landscape-tablet slide-out menu. */
const MENU_WIDTH = 380;

function App() {
  useKeyboardShortcuts();
  const showSpectrum = useTunerStore((s) => s.showSpectrum);
  const theme = useTunerStore((s) => s.theme);
  const highContrast = useTunerStore((s) => s.highContrast);
  const largeText = useTunerStore((s) => s.largeText);
  const menuOpen = useTunerStore((s) => s.menuOpen);
  const setMenuOpen = useTunerStore((s) => s.setMenuOpen);
  const menuPinned = useTunerStore((s) => s.menuPinned);
  const tourActive = useTunerStore((s) => s.tourActive);
  const stopwatchOn = useTunerStore((s) => s.stopwatchOn);

  // Layout mode: ≥1024px is the "wide" layout (desktop + landscape tablet)
  // with the right slide-out menu. Below that (phone + portrait tablet) the
  // controls live in the bottom slide-up quick-pick instead. This width
  // breakpoint doubles as the tablet orientation switch (iPad portrait is
  // <1024, landscape ≥1024).
  const [isWide, setIsWide] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', largeText);
  }, [largeText]);

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

  // Auto-hide the wide-layout menu after 10s of no interaction inside it, to
  // free up strobe width while tuning. Any pointer / key / wheel / input
  // event within the menu re-arms the timer. Paused while the Settings modal
  // is open (its interactions live outside the panel). Mirrors the mobile
  // slide-up's auto-hide.
  useEffect(() => {
    // Pause auto-hide while pinned or during the onboarding tour (so the menu
    // can't vanish mid-tour).
    if (!isWide || !menuOpen || menuPinned || tourActive) return;
    const TIMEOUT_MS = 20_000;
    let t: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (t !== null) clearTimeout(t);
      t = setTimeout(() => {
        // Don't yank the menu out from behind an open modal, or when the
        // user has pinned it open — reschedule instead.
        if (useTunerStore.getState().settingsOpen || useTunerStore.getState().menuPinned) arm();
        else useTunerStore.getState().setMenuOpen(false);
      }, TIMEOUT_MS);
    };
    const inPanel = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('[data-side-panel]') !== null;
    const onEvent = (e: Event) => {
      if (inPanel(e.target)) arm();
    };
    arm();
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'input', 'change'] as const;
    for (const ev of events) document.addEventListener(ev, onEvent, true);
    return () => {
      if (t !== null) clearTimeout(t);
      for (const ev of events) document.removeEventListener(ev, onEvent, true);
    };
  }, [isWide, menuOpen, menuPinned, tourActive]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative">
      <OnboardingTour />
      <AudioErrorToast />
      <UpdateBanner />
      <DesktopUpdater />
      <SettingsModal />

      {/* Top header — always above the strobe. iOS PWA runs in
          black-translucent mode (content extends under the notch / status
          bar), so pad the top + sides with the safe-area insets. */}
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
            STROBE TUNER
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Compact stopwatch — surfaces in the header on the wide layout
              when the menu is hidden but a stopwatch session is active, so
              it stays visible. */}
          {isWide && !menuOpen && stopwatchOn && <StopwatchChip />}
          {/* Burger — toggles the slide-out menu. Wide layout only; on
              narrow layouts the controls live in the bottom slide-up. */}
          {isWide && (
            <button
              data-tour="burger"
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 rounded flex items-center justify-center"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--accent-cyan)',
                border: '1px solid var(--border)',
              }}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Main row */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Canvas column — strobe, spectrum (when toggled), then on narrow
            layouts the stopwatch + slide-up quick-pick pinned at the bottom. */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <StrobeDisplay />
          </div>
          {showSpectrum && (
            <div data-tour="tour-spectrum-panel" className="shrink-0 flex flex-col min-h-0">
              <SpectrumAnalyzer />
              <IsolationBand />
            </div>
          )}
          {!isWide && stopwatchOn && <Stopwatch />}
          {!isWide && <QuickPitchBar />}
        </div>

        {/* Wide-layout slide-out menu — pushes the canvas (width animates,
            giving the shrink/grow effect). Fully hidden when closed. */}
        {isWide && (
          <div
            data-side-panel
            className="shrink-0 flex flex-col"
            style={{
              width: menuOpen ? MENU_WIDTH : 0,
              overflow: 'hidden',
              transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--bg-secondary)',
              borderLeft: menuOpen ? '1px solid var(--border)' : 'none',
              paddingRight: 'env(safe-area-inset-right)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            {/* Fixed-width inner so content doesn't reflow while the outer
                width animates. */}
            <div className="flex flex-col h-full" style={{ width: MENU_WIDTH }}>
              <TealIconRow>
                <button
                  data-tour="tour-pin"
                  onClick={() => useTunerStore.getState().setMenuPinned(!menuPinned)}
                  aria-label={menuPinned ? 'Unpin menu' : 'Keep menu open'}
                  aria-pressed={menuPinned}
                  title={menuPinned ? 'Unpin menu' : 'Keep menu open'}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  style={{
                    color: menuPinned ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    background: menuPinned ? 'rgba(6, 182, 212, 0.18)' : 'transparent',
                    border: `1px solid ${menuPinned ? 'var(--accent-cyan)' : 'transparent'}`,
                  }}
                >
                  {/* Pin icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                  </svg>
                </button>
              </TealIconRow>

              {/* Scrollable: tuning/scale content (no accordion). The SA
                  toggle now lives as an icon in the teal row above. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ReferenceBar />
                <PitchDial />
              </div>

              {/* Pinned bottom — stopwatch (when on) above Let's Go. */}
              {stopwatchOn && <Stopwatch />}
              <ControlBar />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable iOS-style toggle row used in the wide menu for the Spectrum
 * Analyser switch.
 */
export default App;
