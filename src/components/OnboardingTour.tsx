import { useEffect, useMemo, useRef, useState } from 'react';
import { useTunerStore } from '../store/tunerStore';

/**
 * First-launch interactive tour. Spotlights one (or more) UI targets at a
 * time and waits for the user to actually perform the required action
 * before advancing — "learn by doing" rather than a clickable carousel.
 *
 * Architecture:
 *   - Targets are looked up via `data-tour="<id>"` attributes.
 *   - A semi-transparent overlay (4 div blockers arranged around the
 *     spotlight cutout) dims everything *except* the target. Clicks land
 *     on the target through the cutout; everywhere else is intercepted.
 *   - Steps either auto-advance via a store predicate (`advanceWhen`) or
 *     show a Next button (`manualAdvance: true`).
 *   - `Esc` and the × button skip the tour. Both set `onboardingDone` so
 *     we don't bug the user again — they can re-launch from Settings.
 *
 * Orchestration:
 *   - Force `selectedScaleId='chromatic'` on entry, restore on exit so the
 *     user's saved preference isn't permanently overridden.
 *   - Reset accordions to closed on entry.
 *   - Open/close the mobile drawer (`panelOpen`) as needed so the spot-
 *     lit element is actually visible (e.g. close the drawer when target
 *     is the spectrum canvas in the main column).
 */

import type { TunerState } from '../store/tunerStore';
import { stopAudio } from '../audio/AudioEngine';

/** Predicate receives the current store + a snapshot taken on step entry.
 *  Steps should compare the two so we don't cascade through state that
 *  was already satisfied when the tour started (the bug that made
 *  "Show tour again" complete itself in 200ms). */
type AdvancePredicate = (s: TunerState, snap: TunerState) => boolean;

interface TourStep {
  id: string;
  /** data-tour value(s) to highlight. Multiple = union bounding box. */
  targets: string[];
  title: string;
  body: string;
  /** Auto-advance when this returns true. */
  advanceWhen?: AdvancePredicate;
  /** Hide a Next button when false (predicate-driven step). */
  manualAdvance?: boolean;
  /** Skip this step on viewports where `window.matchMedia(query)` matches. */
  skipOnMedia?: string;
  /** Side effects to run when entering this step. */
  onEnter?: () => void;
}

const LG_MEDIA = '(min-width: 1024px)';   // desktop
const NARROW_MEDIA = '(max-width: 1023px)'; // phone + portrait tablet

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    targets: ['welcome'],
    title: 'Welcome to V-Tune',
    body: 'A quick guided tour of the layout — learn by doing. Tap Next to begin.',
    manualAdvance: true,
  },

  // ── Open the controls (platform-specific) ──────────────────────────
  {
    id: 'open-desktop',
    targets: ['burger'],
    title: 'Open the menu',
    body: 'Tap the menu button to slide out your controls.',
    advanceWhen: (s, snap) => s.menuOpen && !snap.menuOpen,
    skipOnMedia: NARROW_MEDIA,
  },
  {
    id: 'open-mobile',
    targets: ['tour-notebar'],
    title: 'Open the menu',
    body: 'Tap here to slide up your controls.',
    advanceWhen: (s, snap) => s.quickPickOpen && !snap.quickPickOpen,
    skipOnMedia: LG_MEDIA,
  },

  // ── Utility (teal) icon bar ────────────────────────────────────────
  {
    id: 'utility',
    targets: ['tour-utility'],
    title: 'Your utility menu',
    body: 'This teal bar is where you reach Settings, the Stopwatch, the Spectrum Analyser, light / dark mode, and pinning the menu open. Let’s try each — tap Next.',
    manualAdvance: true,
  },
  {
    id: 'settings-open',
    targets: ['tour-settings'],
    title: 'Settings',
    body: 'Tap the gear to open your settings.',
    advanceWhen: (s, snap) => s.settingsOpen && !snap.settingsOpen,
  },

  // ── Inside the Settings modal ──────────────────────────────────────
  {
    id: 'modal-input',
    targets: ['modal-input'],
    title: 'Input',
    body: 'Your input settings live here — microphone, sensitivity and hum. Go ahead and pick your microphone from the dropdown.',
    advanceWhen: (s, snap) => s.inputDeviceId !== snap.inputDeviceId,
  },
  {
    id: 'modal-tuning',
    targets: ['modal-tuning'],
    title: 'Tuning',
    body: 'This is where your tuning options live — reference pitch (A4), tolerance and auto-detect.',
    manualAdvance: true,
    skipOnMedia: LG_MEDIA, // desktop shows tuning in the menu instead
  },
  {
    id: 'modal-strobe',
    targets: ['modal-strobe'],
    title: 'Strobe preferences',
    body: 'Tweak how the strobe looks and behaves — brightness, blur, speed and more.',
    manualAdvance: true,
  },
  {
    id: 'modal-accessibility',
    targets: ['modal-accessibility'],
    title: 'Accessibility',
    body: 'High-contrast and larger-text options for easier reading.',
    manualAdvance: true,
  },
  {
    id: 'modal-close',
    targets: ['modal-close'],
    title: 'Close settings',
    body: 'Tap the ✕ to close settings and carry on.',
    advanceWhen: (s, snap) => !s.settingsOpen && snap.settingsOpen,
  },

  // ── Back to the utility bar ────────────────────────────────────────
  {
    id: 'stopwatch-icon',
    targets: ['tour-stopwatch'],
    title: 'Stopwatch',
    body: 'Tap to reveal a timing aid that tracks how long you’ve been tuning.',
    advanceWhen: (s, snap) => s.stopwatchOn && !snap.stopwatchOn,
  },
  {
    id: 'stopwatch-panel',
    targets: ['tour-stopwatch-panel'],
    title: 'Your stopwatch',
    body: 'Here it is — start, stop and reset it here. Tap Next to carry on.',
    manualAdvance: true,
  },
  {
    id: 'spectrum-icon',
    targets: ['sa-toggle'],
    title: 'Spectrum analyser',
    body: 'Tap to reveal the analyser — with two isolation strobes for fine-tuning partials.',
    advanceWhen: (s, snap) => s.showSpectrum && !snap.showSpectrum,
  },
  {
    id: 'spectrum-panel',
    targets: ['tour-spectrum-panel'],
    title: 'The analyser',
    body: 'It appears under the strobes, with two isolation strobes ready to fine-tune partials. Tap Next.',
    manualAdvance: true,
  },
  {
    id: 'pin',
    targets: ['tour-pin'],
    title: 'Pin it open',
    body: 'Tap the pin to keep the menu open (no auto-hide) — try it, or tap Next.',
    manualAdvance: true,
    advanceWhen: (s, snap) =>
      (s.menuPinned && !snap.menuPinned) || (s.quickPickPinned && !snap.quickPickPinned),
  },
  {
    id: 'theme',
    targets: ['tour-theme'],
    title: 'Light / dark',
    body: 'This toggles light and dark mode — try it, or tap Next to continue.',
    manualAdvance: true,
    advanceWhen: (s, snap) => s.theme !== snap.theme,
  },

  // ── Tuning (desktop lives in the menu) + scale + go ────────────────
  {
    id: 'tuning-desktop',
    targets: ['tour-tuning'],
    title: 'Tuning',
    body: 'This is where your tuning options live — reference pitch (A4), tolerance and auto-detect.',
    manualAdvance: true,
    skipOnMedia: NARROW_MEDIA, // mobile already covered tuning in the modal
  },
  {
    id: 'scale',
    targets: ['tour-scale'],
    title: 'Choose a scale',
    body: 'This is where you pick the scale you’re tuning. Go ahead and choose one from the dropdown.',
    advanceWhen: (s, snap) => s.selectedScaleId !== snap.selectedScaleId,
  },
  {
    id: 'lets-go',
    targets: ['lets-go'],
    title: "Let's go!",
    body: 'That’s it — all that’s left is to start tuning. Tap Let’s Go!',
    advanceWhen: (s, snap) => s.isRunning && !snap.isRunning,
  },
];

// ──────────────────────────────────────────────────────────────────────

const HIGHLIGHT_PAD = 6; // pixels of breathing room around target rect
const TOOLTIP_GAP = 12;  // gap between spotlight and tooltip

interface Box { left: number; top: number; right: number; bottom: number; }

function unionRect(rects: DOMRect[]): Box | null {
  if (rects.length === 0) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const r of rects) {
    if (r.left < left) left = r.left;
    if (r.top < top) top = r.top;
    if (r.right > right) right = r.right;
    if (r.bottom > bottom) bottom = r.bottom;
  }
  return { left, top, right, bottom };
}

/** Pick the best visible element when multiple share the same data-tour
 *  (e.g. the Let's Go button exists in both ControlBar and QuickPitchBar
 *  but only one is rendered at a given breakpoint). */
function findVisibleByDataTour(id: string): Element | null {
  const matches = document.querySelectorAll(`[data-tour="${id}"]`);
  for (const el of matches) {
    const r = (el as HTMLElement).getBoundingClientRect();
    const visible =
      r.width > 0 &&
      r.height > 0 &&
      window.getComputedStyle(el as HTMLElement).visibility !== 'hidden';
    if (visible) return el;
  }
  return matches[0] ?? null;
}

export function OnboardingTour() {
  const tourActive = useTunerStore((s) => s.tourActive);
  const [stepIdx, setStepIdx] = useState(0);
  const [boxes, setBoxes] = useState<DOMRect[]>([]);
  // The frame we'd ideally place the tooltip near.
  const [unionBox, setUnionBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  // Snapshot the user's scale on entry so we can restore it on exit.
  const savedScaleRef = useRef<string | null>(null);
  // Snapshot of the entire store at the moment the current step became
  // active — predicates compare against this to detect *changes* rather
  // than absolute state (which is what made "Show tour again" cascade
  // through any already-satisfied step in 200ms).
  const stepSnapshotRef = useRef<TunerState | null>(null);

  // Resolve effective step list (skip steps whose skipOnMedia matches).
  // Done synchronously via useMemo — using a ref + useEffect caused the
  // tour to fail to render on the first paint after `tourActive` flipped
  // true (refs don't trigger re-renders), so the tour only became visible
  // after some other store change caused a re-render — by which point
  // the user had already opened the panel and step 3 could never advance.
  // Recompute on viewport width too, so the desktop/mobile step forks stay
  // correct if the window crosses the breakpoint (or the initial size settles
  // after mount).
  const effectiveSteps = useMemo(
    () =>
      tourActive
        ? STEPS.filter(
            (s) => !s.skipOnMedia || !window.matchMedia(s.skipOnMedia).matches,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourActive, viewport.w],
  );

  // Reset step index whenever the tour (re-)activates so "Show tour again"
  // starts from step 0 each time.
  useEffect(() => {
    if (tourActive) setStepIdx(0);
  }, [tourActive]);

  const step = effectiveSteps[stepIdx] ?? null;

  // ── Tour entry / exit side effects ──────────────────────────────────
  // Reset the relevant slices of app state to a known baseline so the
  // tour starts from the same place no matter what the user was doing.
  // Critically, this prevents predicates like "showSpectrum === true"
  // from being already satisfied by a re-running tour and cascading.
  useEffect(() => {
    if (!tourActive) return;
    const s = useTunerStore.getState();
    savedScaleRef.current = s.selectedScaleId;
    // Force chromatic so the "choose a scale" step is a genuine change.
    if (s.selectedScaleId !== 'chromatic') s.setSelectedScale('chromatic');
    // Collapse the menu / slide-up so the "open the menu" step is a real
    // open action; unpin both so the "pin it" step is a genuine toggle.
    s.setMenuOpen(false);
    s.setMenuPinned(false);
    s.setQuickPickOpen(false);
    s.setQuickPickPinned(false);
    // Close the settings modal so opening it is a genuine action.
    s.setSettingsOpen(false);
    // Turn off stopwatch + SA (and clear iso windows) so those "tap to
    // reveal" steps are real actions.
    s.setStopwatchOn(false);
    if (s.showSpectrum) s.setShowSpectrum(false);
    if (s.isolations.length > 0) s.clearIsolations();
    // Stop audio so the "Let's Go" step starts in the off state.
    if (s.isRunning) stopAudio();
  }, [tourActive]);

  // ── Per-step onEnter hook ───────────────────────────────────────────
  useEffect(() => {
    if (!tourActive || !step) return;
    step.onEnter?.();
  }, [tourActive, step]);

  // ── Re-measure target boxes every frame (cheap, robust against scroll
  //    / accordion expansion / panel slide animations). ───────────────
  useEffect(() => {
    if (!tourActive || !step) return;
    let raf = 0;
    const tick = () => {
      const rects: DOMRect[] = [];
      for (const id of step.targets) {
        const el = findVisibleByDataTour(id);
        if (el) rects.push((el as HTMLElement).getBoundingClientRect());
      }
      setBoxes(rects);
      setUnionBox(unionRect(rects));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tourActive, step]);

  // ── Auto-advance: snapshot store on entry, then subscribe and compare ─
  useEffect(() => {
    if (!tourActive || !step) return;
    // Always snapshot — even manual-advance steps may need it later, and
    // it gives a consistent reference point for the active step.
    stepSnapshotRef.current = useTunerStore.getState();
    if (!step.advanceWhen) return;
    let advanced = false;
    const check = () => {
      if (advanced) return;
      const s = useTunerStore.getState();
      const snap = stepSnapshotRef.current!;
      if (step.advanceWhen!(s, snap)) {
        advanced = true;
        // Small delay so the user can see their action register before
        // the spotlight jumps to the next thing.
        setTimeout(() => advance(), 250);
      }
    };
    // Do NOT check immediately — we want a user-driven transition, not
    // any state that happened to already match the predicate.
    const unsub = useTunerStore.subscribe(check);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, step]);

  // ── Viewport resize listener for tooltip clamping ──────────────────
  useEffect(() => {
    if (!tourActive) return;
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize(); // sync to the real size at tour start (initial state may be stale)
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tourActive]);

  // ── Esc to skip ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive]);

  const advance = () => {
    setStepIdx((i) => {
      const next = i + 1;
      if (next >= effectiveSteps.length) {
        completeTour();
        return i;
      }
      return next;
    });
  };

  /** Land on the standard default working layout: Spectrum Analyser on with
   *  its two colour-coded isolation windows, and the tour's demo toggles
   *  (stopwatch, pin) returned to their calm defaults. The scale is left as
   *  the user chose in the "choose a scale" step. */
  const completeTour = () => {
    const s = useTunerStore.getState();
    s.setShowSpectrum(true);
    s.resetIsolationsToDefault();
    s.setStopwatchOn(false);
    s.setMenuPinned(false);
    s.setQuickPickPinned(false);
    s.setOnboardingDone(true);
    s.setTourActive(false);
  };

  /** Skip / dismiss — restore the default working layout (the entry reset
   *  turned SA off etc.) and the user's pre-tour scale, then close. */
  const endTour = () => {
    const s = useTunerStore.getState();
    s.setShowSpectrum(true);
    s.resetIsolationsToDefault();
    s.setStopwatchOn(false);
    s.setMenuPinned(false);
    s.setQuickPickPinned(false);
    if (savedScaleRef.current && s.selectedScaleId !== savedScaleRef.current) {
      s.setSelectedScale(savedScaleRef.current);
    }
    s.setOnboardingDone(true);
    s.setTourActive(false);
  };

  if (!tourActive || !step) return null;

  // ── Spotlight rect (with padding & viewport clamping) ──────────────
  const u = unionBox;
  const spotlight = u
    ? {
        left: Math.max(0, u.left - HIGHLIGHT_PAD),
        top: Math.max(0, u.top - HIGHLIGHT_PAD),
        right: Math.min(viewport.w, u.right + HIGHLIGHT_PAD),
        bottom: Math.min(viewport.h, u.bottom + HIGHLIGHT_PAD),
      }
    : null;

  // ── Tooltip placement (try below → above → right → left, pick what fits)
  const TT_W = Math.min(340, viewport.w - 24);
  const TT_H_EST = 160; // generous estimate; final box auto-sizes
  let ttLeft = 12;
  let ttTop = 12;
  if (spotlight) {
    const spaceBelow = viewport.h - spotlight.bottom;
    const spaceAbove = spotlight.top;
    const spaceRight = viewport.w - spotlight.right;
    const spaceLeft = spotlight.left;
    const centreX = (spotlight.left + spotlight.right) / 2;
    const centreY = (spotlight.top + spotlight.bottom) / 2;

    if (spaceBelow > TT_H_EST + TOOLTIP_GAP) {
      ttLeft = Math.max(12, Math.min(viewport.w - TT_W - 12, centreX - TT_W / 2));
      ttTop = spotlight.bottom + TOOLTIP_GAP;
    } else if (spaceAbove > TT_H_EST + TOOLTIP_GAP) {
      ttLeft = Math.max(12, Math.min(viewport.w - TT_W - 12, centreX - TT_W / 2));
      ttTop = spotlight.top - TT_H_EST - TOOLTIP_GAP;
    } else if (spaceRight > TT_W + TOOLTIP_GAP) {
      ttLeft = spotlight.right + TOOLTIP_GAP;
      ttTop = Math.max(12, Math.min(viewport.h - TT_H_EST - 12, centreY - TT_H_EST / 2));
    } else if (spaceLeft > TT_W + TOOLTIP_GAP) {
      ttLeft = spotlight.left - TT_W - TOOLTIP_GAP;
      ttTop = Math.max(12, Math.min(viewport.h - TT_H_EST - 12, centreY - TT_H_EST / 2));
    } else {
      // Nowhere fits cleanly — pin to the bottom-centre.
      ttLeft = Math.max(12, viewport.w / 2 - TT_W / 2);
      ttTop = Math.max(12, viewport.h - TT_H_EST - 16);
    }
  }

  // The 4 dim-overlay blockers (top / left / right / bottom around cutout).
  // Each has pointer-events:auto so clicks land on it instead of leaking
  // through; clicks inside the cutout pass through to the underlying app.
  const blockerBg = 'rgba(0, 0, 0, 0.65)';
  const blockers = spotlight
    ? [
        // top
        { left: 0, top: 0, width: viewport.w, height: spotlight.top },
        // bottom
        { left: 0, top: spotlight.bottom, width: viewport.w, height: viewport.h - spotlight.bottom },
        // left of cutout
        { left: 0, top: spotlight.top, width: spotlight.left, height: spotlight.bottom - spotlight.top },
        // right of cutout
        {
          left: spotlight.right,
          top: spotlight.top,
          width: viewport.w - spotlight.right,
          height: spotlight.bottom - spotlight.top,
        },
      ]
    : [{ left: 0, top: 0, width: viewport.w, height: viewport.h }];

  return (
    <div
      // Anchor to the viewport, sit above everything (drawer z is 50).
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        pointerEvents: 'none', // children opt-in via auto
      }}
    >
      {blockers.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            background: blockerBg,
            pointerEvents: 'auto',
            transition: 'all 200ms ease',
          }}
          // Swallow stray clicks on the dim area — keeps focus on the
          // target. The cutout passes through naturally.
          onClick={(e) => e.stopPropagation()}
        />
      ))}

      {/* Spotlight outline (visual ring, no click handling) */}
      {spotlight && (
        <div
          style={{
            position: 'absolute',
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.right - spotlight.left,
            height: spotlight.bottom - spotlight.top,
            border: '2px solid var(--accent-cyan)',
            borderRadius: 6,
            boxShadow: '0 0 0 4px rgba(6, 182, 212, 0.22), 0 0 24px rgba(6, 182, 212, 0.35)',
            pointerEvents: 'none',
            transition: 'all 200ms ease',
          }}
        />
      )}
      {/* Secondary outlines for each individual target inside a union */}
      {boxes.length > 1 &&
        boxes.map((r, i) => (
          <div
            key={`sub-${i}`}
            style={{
              position: 'absolute',
              left: r.left - 2,
              top: r.top - 2,
              width: r.width + 4,
              height: r.height + 4,
              border: '1px dashed rgba(6, 182, 212, 0.7)',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          />
        ))}

      {/* Tooltip card. Hidden while the current target is momentarily
          unmeasurable (e.g. the settings modal animating closed) so it
          doesn't flash to the default top-left "welcome" position before the
          next step's spotlight resolves. */}
      {spotlight && (
      <div
        role="dialog"
        aria-label="Onboarding tour"
        style={{
          position: 'absolute',
          left: ttLeft,
          top: ttTop,
          width: TT_W,
          maxWidth: 'calc(100vw - 24px)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '14px 14px 12px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          pointerEvents: 'auto',
          transition: 'left 200ms ease, top 200ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
            }}
          >
            Step {stepIdx + 1} of {effectiveSteps.length}
          </span>
          <button
            onClick={endTour}
            style={{
              background: 'transparent',
              color: 'var(--text-dim)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Skip tour"
            title="Skip tour"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 6,
            color: 'var(--accent-cyan)',
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.45,
            color: 'var(--text-secondary)',
          }}
        >
          {step.body}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            gap: 8,
          }}
        >
          <button
            onClick={endTour}
            style={{
              background: 'transparent',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Skip tour
          </button>
          {step.manualAdvance ? (
            <button
              onClick={advance}
              style={{
                background: 'var(--accent-cyan)',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Next →
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              waiting for your tap…
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
