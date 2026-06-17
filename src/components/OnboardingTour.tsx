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
  /** Where the drawer should be when this step is active (mobile only). */
  drawer?: 'open' | 'closed';
}

const LG_MEDIA = '(min-width: 1024px)';

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    targets: ['welcome'],
    title: 'Welcome to V-Tune',
    body: 'A quick guided tour to get familiar with the layout. Tap Next to begin.',
    manualAdvance: true,
  },
  {
    id: 'theme',
    targets: ['theme-toggle'],
    title: 'Light / dark',
    body: 'Tap the icon to flip between light and dark mode.',
    advanceWhen: (s, snap) => s.theme !== snap.theme,
  },
  {
    id: 'burger',
    targets: ['burger'],
    title: 'Open the menu',
    body: 'Tap the menu icon to slide the side panel out.',
    advanceWhen: (s, snap) => s.panelOpen && !snap.panelOpen,
    skipOnMedia: LG_MEDIA, // on desktop the panel is always visible
  },
  {
    id: 'tuning-header',
    targets: ['tuning-header'],
    title: 'Tuning / Scale',
    body: 'Open the Tuning / Scale section to pick a note.',
    advanceWhen: (s, snap) =>
      s.openAccordion === 'tuning' && snap.openAccordion !== 'tuning',
  },
  {
    id: 'pick-d3',
    targets: ['pitch-dial'],
    title: 'Pick D3',
    body: 'Tap D on the note layout below, then use the OCT − button to drop to octave 3.',
    advanceWhen: (s, snap) => {
      const isD3 =
        s.currentNote !== null &&
        s.currentNote.name === 'D' &&
        s.currentNote.octave === 3;
      const wasD3 =
        snap.currentNote !== null &&
        snap.currentNote.name === 'D' &&
        snap.currentNote.octave === 3;
      return isD3 && !wasD3;
    },
  },
  {
    id: 'settings-header',
    targets: ['settings-header'],
    title: 'Settings',
    body: 'Open Settings to tune the strobe itself.',
    advanceWhen: (s, snap) =>
      s.openAccordion === 'settings' && snap.openAccordion !== 'settings',
  },
  {
    id: 'settings-input-mic',
    targets: ['settings-input', 'settings-mic'],
    title: 'Microphone',
    body: 'Here you can pick your input device and adjust the microphone sensitivity.',
    manualAdvance: true,
  },
  {
    id: 'settings-strobe-feel',
    targets: ['settings-brightness', 'settings-blur', 'settings-speed'],
    title: 'Strobe feel',
    body: 'Set the brightness of the strobe, the softness of the red / green bar edges, and the tracking speed.',
    manualAdvance: true,
  },
  {
    id: 'sa-toggle',
    targets: ['sa-toggle'],
    title: 'Spectrum Analyser',
    body: 'Turn on the Spectrum Analyser to see the full frequency content of your handpan.',
    advanceWhen: (s, snap) => s.showSpectrum && !snap.showSpectrum,
  },
  {
    id: 'spectrum-iso',
    targets: ['spectrum-canvas'],
    title: 'Isolate a frequency',
    body:
      'Shift + drag (or touch-hold then drag on mobile) across the spectrum to draw an isolation window. The loudest peak inside it becomes a dedicated tuning band.',
    advanceWhen: (s, snap) => s.isolations.length > snap.isolations.length,
    drawer: 'closed', // canvas lives in the main column, drawer would cover it on mobile
  },
  {
    id: 'lets-go',
    targets: ['lets-go'],
    title: "Let's Go",
    body: 'Tap to start listening. From here, just strike the note and watch the strobe lock in.',
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
  const effectiveSteps = useMemo(
    () =>
      tourActive
        ? STEPS.filter(
            (s) => !s.skipOnMedia || !window.matchMedia(s.skipOnMedia).matches,
          )
        : [],
    [tourActive],
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
    // Force chromatic so step "Pick D3" is reachable with the same
    // keyboard everyone sees.
    if (s.selectedScaleId !== 'chromatic') s.setSelectedScale('chromatic');
    // Close any open accordion (so the "open this" steps require action).
    if (s.openAccordion !== null) s.toggleAccordion(s.openAccordion);
    // Close the mobile drawer so step 3 (burger) is a genuine open.
    if (s.panelOpen) s.setPanelOpen(false);
    // Turn off the SA + clear iso windows so steps 9/10 are real actions.
    if (s.showSpectrum) s.setShowSpectrum(false);
    if (s.isolations.length > 0) s.clearIsolations();
    // Stop audio so step 11 ("Let's Go") starts in the off state.
    if (s.isRunning) stopAudio();
    return () => {
      // Restore the user's scale on tour exit.
      const cur = useTunerStore.getState();
      if (savedScaleRef.current && cur.selectedScaleId !== savedScaleRef.current) {
        cur.setSelectedScale(savedScaleRef.current);
      }
    };
  }, [tourActive]);

  // ── Drawer orchestration: open/close per step on mobile ─────────────
  useEffect(() => {
    if (!tourActive || !step) return;
    const isMobile = !window.matchMedia(LG_MEDIA).matches;
    if (!isMobile) return;
    if (step.drawer === 'closed' && useTunerStore.getState().panelOpen) {
      useTunerStore.getState().setPanelOpen(false);
    } else if (step.drawer === 'open' && !useTunerStore.getState().panelOpen) {
      useTunerStore.getState().setPanelOpen(true);
    }
  }, [tourActive, step]);

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

  /** Natural completion — leave the app's default working layout: the
   *  Spectrum Analyser on with its two colour-coded isolation windows (teal
   *  + purple), and any open accordion closed. The tour itself cleared
   *  these on entry so its "turn on SA" / "draw an isolation" steps were
   *  genuine; here we restore the standard default so the user lands on the
   *  full experience rather than a blank canvas. */
  const completeTour = () => {
    const s = useTunerStore.getState();
    s.setShowSpectrum(true);
    s.resetIsolationsToDefault();
    if (s.openAccordion !== null) s.toggleAccordion(s.openAccordion);
    s.setOnboardingDone(true);
    s.setTourActive(false);
  };

  /** Skip / dismiss — don't touch the user's layout, just close the tour. */
  const endTour = () => {
    const s = useTunerStore.getState();
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

      {/* Tooltip card */}
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
    </div>
  );
}
