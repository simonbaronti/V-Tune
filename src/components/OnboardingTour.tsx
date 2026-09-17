import { useEffect, useMemo, useRef, useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { useProStore } from '../pro/proStore';

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

/**
 * Open whichever container the controls live in at this width.
 *
 * The desktop menu and the mobile picker hold the same controls behind
 * different chrome, so "which one to open" is a breakpoint question rather
 * than something each step should have to know. Without this, any step
 * reached with the panel shut spotlights a target sitting off-canvas.
 */
function openPanel(): void {
  const s = useTunerStore.getState();
  if (window.matchMedia(LG_MEDIA).matches) s.setMenuOpen(true);
  else s.setQuickPickOpen(true);
}

/** The inverse, for targets in the main column that the mobile picker would
 *  otherwise cover. Desktop needs nothing: its menu sits beside the column,
 *  not over it. */
function closePanelOnNarrow(): void {
  if (window.matchMedia(LG_MEDIA).matches) return;
  useTunerStore.getState().setQuickPickOpen(false);
}

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
    onEnter: openPanel,
    targets: ['tour-utility'],
    title: 'Your utility menu',
    body: 'This teal bar is where you reach Settings, the Stopwatch, the Spectrum Analyser, light / dark mode, and pinning the menu open. Let’s try each — tap Next.',
    manualAdvance: true,
  },
  {
    id: 'settings-open',
    onEnter: openPanel,
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
    body: 'Your input settings live here — microphone, sensitivity and hum. Pick your microphone from the dropdown, or tap Next.',
    advanceWhen: (s, snap) => s.inputDeviceId !== snap.inputDeviceId,
    // Next as well as the predicate, because this is the one step whose
    // action the user may be unable to perform: decline the microphone
    // prompt and the dropdown has nothing to pick, so a predicate-only step
    // strands the tour here with no way forward.
    manualAdvance: true,
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
    onEnter: openPanel,
    targets: ['tour-stopwatch'],
    title: 'Stopwatch',
    body: 'Tap to reveal a timing aid that tracks how long you’ve been tuning.',
    advanceWhen: (s, snap) => s.stopwatchOn && !snap.stopwatchOn,
  },
  {
    id: 'stopwatch-panel',
    onEnter: closePanelOnNarrow,
    targets: ['tour-stopwatch-panel'],
    title: 'Your stopwatch',
    body: 'Here it is — start, stop and reset it here. Tap Next to carry on.',
    manualAdvance: true,
  },
  {
    id: 'spectrum-icon',
    onEnter: openPanel,
    targets: ['sa-toggle'],
    title: 'Spectrum analyser',
    body: 'Tap to reveal the analyser — with two isolation windows for fine-tuning partials.',
    advanceWhen: (s, snap) => s.showSpectrum && !snap.showSpectrum,
  },
  {
    id: 'spectrum-panel',
    onEnter: closePanelOnNarrow,
    targets: ['tour-spectrum-panel'],
    title: 'The analyser',
    body: 'It appears under the strobes, with two isolation windows and their bands, ready to fine-tune partials. Tap Next.',
    manualAdvance: true,
  },
  {
    id: 'pin',
    onEnter: openPanel,
    targets: ['tour-pin'],
    title: 'Pin it open',
    body: 'Tap the pin to keep the menu open (no auto-hide) — try it, or tap Next.',
    manualAdvance: true,
    advanceWhen: (s, snap) =>
      (s.menuPinned && !snap.menuPinned) || (s.quickPickPinned && !snap.quickPickPinned),
  },
  {
    id: 'theme',
    onEnter: openPanel,
    targets: ['tour-theme'],
    title: 'Light / dark',
    body: 'This toggles light and dark mode — try it, or tap Next to continue.',
    manualAdvance: true,
    advanceWhen: (s, snap) => s.theme !== snap.theme,
  },

  // ── Tuning (desktop lives in the menu) + scale + go ────────────────
  {
    id: 'tuning-desktop',
    onEnter: openPanel,
    targets: ['tour-tuning'],
    title: 'Tuning',
    body: 'This is where your tuning options live — reference pitch (A4), tolerance and auto-detect.',
    manualAdvance: true,
    skipOnMedia: NARROW_MEDIA, // mobile already covered tuning in the modal
  },
  {
    id: 'scale',
    onEnter: openPanel,
    targets: ['tour-scale'],
    title: 'Choose a scale',
    body: 'This is where you pick the scale you’re tuning. Go ahead and choose one from the dropdown.',
    advanceWhen: (s, snap) => s.selectedScaleId !== snap.selectedScaleId,
  },
  {
    id: 'lets-go',
    onEnter: openPanel,
    targets: ['lets-go'],
    title: "Let's go!",
    body: 'That’s it — all that’s left is to start tuning. Tap Let’s Go!',
    advanceWhen: (s, snap) => s.isRunning && !snap.isRunning,
  },
];

// ──────────────────────────────────────────────────────────────────────

const HIGHLIGHT_PAD = 6; // pixels of breathing room around target rect
const TOOLTIP_GAP = 12;  // gap between spotlight and tooltip
// How long a step may fail to resolve its target before the card is shown
// centre-screen anyway. Long enough to cover a modal or drawer animating,
// short enough that nobody is left staring at a dimmed screen.
const STRANDED_MS = 700;

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

/**
 * How much of an element the user can actually see, in square pixels.
 *
 * Having a width and a height says nothing about being visible here. A
 * closed drawer keeps its children fully measurable: the desktop menu
 * animates to `width: 0` while its contents keep their own width and spill
 * off the right-hand edge, and the mobile picker slides below the fold. Both
 * report a healthy box at coordinates nobody can see — which is how the
 * spotlight ended up clamped to a few pixels against the viewport edge, or
 * to a negative width, while the tooltip pointed at it.
 */
function onScreenArea(el: Element): number {
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return 0;
  if (window.getComputedStyle(el as HTMLElement).visibility === 'hidden') return 0;
  const w = Math.max(0, Math.min(window.innerWidth, r.right) - Math.max(0, r.left));
  const h = Math.max(0, Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top));
  return w * h;
}

/** Pick the most visible element when several share the same data-tour —
 *  Let's Go, the pin and the scale picker each exist in both ControlBar and
 *  QuickPitchBar. Null when every copy is off screen, which the caller reads
 *  as "not resolved yet" rather than spotlighting empty space. */
function findVisibleByDataTour(id: string): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll(`[data-tour="${id}"]`)) {
    const area = onScreenArea(el);
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

export function OnboardingTour() {
  const tourActive = useTunerStore((s) => s.tourActive);
  const proStatus = useProStore((s) => s.status);
  const [stepIdx, setStepIdx] = useState(0);
  const [boxes, setBoxes] = useState<DOMRect[]>([]);
  // True once the current step has gone STRANDED_MS without resolving a
  // target. Without it an unresolvable step renders a full-screen blocker
  // and no card at all — no title, no Next, no Skip — which on a phone is
  // unescapable, since Esc is the only other way out.
  const [stranded, setStranded] = useState(false);
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
    // Bring the step's target into view. Some targets live inside scrollable
    // containers (the Settings modal body on phones) and can sit below the
    // fold — leaving the spotlight and tooltip pinned offscreen with no way
    // to read or reach Next. block:'center' scrolls the nearest scrollable
    // ancestor; the per-frame measurer tracks the moving rects. Delayed so
    // open/slide animations settle first.
    const t = setTimeout(() => {
      const el = findVisibleByDataTour(step.targets[0]);
      (el as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
    return () => clearTimeout(t);
  }, [tourActive, step]);

  // ── Re-measure target boxes every frame (cheap, robust against scroll
  //    / accordion expansion / panel slide animations). ───────────────
  useEffect(() => {
    if (!tourActive || !step) return;
    let raf = 0;
    let emptySince = 0;
    setStranded(false);
    const measure = () => {
      const rects: DOMRect[] = [];
      for (const id of step.targets) {
        const el = findVisibleByDataTour(id);
        if (el) rects.push((el as HTMLElement).getBoundingClientRect());
      }
      setBoxes(rects);
      setUnionBox(unionRect(rects));
      if (rects.length === 0) {
        if (emptySince === 0) emptySince = performance.now();
        if (performance.now() - emptySince > STRANDED_MS) setStranded(true);
      } else {
        emptySince = 0;
        setStranded(false);
      }
    };
    // Measure once up front rather than waiting on the first frame. A
    // backgrounded page gets no animation frames at all, so a step entered
    // while hidden — switch away mid-tour and come back — would otherwise
    // paint a dimmed screen with no cutout and no card until something
    // scheduled one.
    measure();
    const tick = () => {
      measure();
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
  // Never run the tour over the Pro lock screen — its click-blockers would
  // sit above the paywall and swallow the unlock/sign-in buttons.
  if (proStatus === 'locked') return null;

  // ── Spotlight rect (with padding & viewport clamping) ──────────────
  const u = unionBox;
  const clamped = u
    ? {
        left: Math.max(0, u.left - HIGHLIGHT_PAD),
        top: Math.max(0, u.top - HIGHLIGHT_PAD),
        right: Math.min(viewport.w, u.right + HIGHLIGHT_PAD),
        bottom: Math.min(viewport.h, u.bottom + HIGHLIGHT_PAD),
      }
    : null;
  // Belt and braces behind findVisibleByDataTour: anything off screen clamps
  // to a sliver against the viewport edge or turns inside out (a negative
  // width), and either reads as the tour pointing at the wrong thing.
  const spotlight =
    clamped && clamped.right > clamped.left && clamped.bottom > clamped.top
      ? clamped
      : null;

  // ── Tooltip placement (try below → above → right → left, pick what fits)
  const TT_W = Math.min(340, viewport.w - 24);
  const TT_H_EST = 160; // generous estimate; final box auto-sizes
  // Centre-screen is where the card sits when there is no spotlight to
  // anchor it to; the branches below move it beside one when there is.
  let ttLeft = Math.max(12, viewport.w / 2 - TT_W / 2);
  let ttTop = Math.max(12, viewport.h / 2 - TT_H_EST / 2);
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

      {/* Tooltip card. Held back while the current target is momentarily
          unmeasurable (e.g. the settings modal animating closed) so it
          doesn't flash to centre-screen before the next step's spotlight
          resolves — but shown regardless once that stops looking momentary,
          so a step that can't find its target is still readable and still
          has a way out. */}
      {(spotlight || stranded) && (
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
          {step.manualAdvance || stranded ? (
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
