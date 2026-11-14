/**
 * Keep the screen awake while the tuner is listening.
 *
 * A handpan is tuned with both hands on the instrument, so nobody touches
 * the screen for minutes at a time while watching the strobe. Left alone,
 * the display dims and sleeps in the middle of the one task the app exists
 * for — and on a workbench, waking it means putting a hammer down.
 *
 * Held only while audio is actually running. A lock on an idle paywall or a
 * settings screen is pure battery drain, and tuning a full pan is already
 * half an hour of screen at full brightness.
 *
 * The part that catches people
 * ----------------------------
 * The browser releases the lock on its own whenever the document stops
 * being visible, and does NOT give it back. Switch apps to check a chart,
 * come back, and the screen starts dimming again — indistinguishable from
 * the feature never having worked. So `visibilitychange` re-acquires.
 *
 * Reports its own state rather than failing quietly, because "the screen
 * still went dark" is impossible to diagnose from a support email. Settings
 * shows what this returns.
 */
import { useEffect, useRef } from 'react';
import { useTunerStore, type WakeLockState } from '../store/tunerStore';

const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** One writer for the store's wakeLock field — this hook, nothing else. */
const report = (state: WakeLockState) => useTunerStore.getState().setWakeLock(state);

export function useWakeLock(active: boolean): WakeLockState {
  const state = useTunerStore((s) => s.wakeLock);
  const held = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const letGo = () => {
      const lock = held.current;
      held.current = null;
      // The sentinel's own 'release' event settles the state, so nothing is
      // set synchronously here — a setState in an effect body would unmount
      // and rebuild whatever renders off it.
      void lock?.release().catch(() => {});
    };

    const take = async () => {
      // Requesting while hidden is rejected, and a second lock while we
      // already hold one is waste.
      if (held.current || document.visibilityState !== 'visible') return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        held.current = lock;
        report('held');
        lock.addEventListener('release', () => {
          if (held.current === lock) held.current = null;
          if (useTunerStore.getState().wakeLock === 'held') report('idle');
        });
      } catch {
        // Refused: an unfocused document, a policy, or a platform that lists
        // the API but won't grant it. Not fatal — the tuner still works.
        if (!cancelled) report('denied');
      }
    };

    if (!active) {
      letGo();
      return;
    }

    void take();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void take();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      letGo();
    };
  }, [active]);

  return state;
}
