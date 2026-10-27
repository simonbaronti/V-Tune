/**
 * Pro state — small reactive store the UI hangs off.
 *
 * status:
 *   'disabled' — Pro layer off (PRO_ENABLED=false): app behaves as the free
 *                1.1.x builds. The gate renders nothing.
 *   'loading'  — determining entitlement on launch.
 *   'pro'      — bought (entitlement active) → everything unlocked, forever.
 *   'trial'    — inside the 14-day window → everything unlocked, days shown.
 *   'locked'   — trial over, not bought → paywall.
 */
import { create } from 'zustand';

export type ProStatus = 'disabled' | 'loading' | 'pro' | 'trial' | 'locked';

interface ProState {
  status: ProStatus;
  /** Whole days left of the trial (0 on the last day), only while 'trial'. */
  trialDaysLeft: number;
  /** Signed-in account email, when a session exists. */
  accountEmail: string | null;
  /**
   * Paid, but the unlock belongs to an anonymous store customer rather than
   * an account.
   *
   * Nothing makes you sign in before buying, so a store purchase made while
   * signed out attaches to an anonymous RevenueCat customer. It works
   * perfectly on the device it was bought on, and fails on every other one:
   * the app looks up the Supabase id, finds a customer who has never bought
   * anything, and tells somebody who paid us that they haven't.
   *
   * Nobody reports this as a bug, because on the device in their hands the
   * app is fine. It arrives as "I bought this and it says I didn't", weeks
   * later, from their second device.
   */
  unattached: boolean;
  /** Manually opened unlock screen (Settings → V-Tune Pro → Unlock now) —
   *  lets trial users (and App Review) reach the purchase before the trial
   *  ends. When 'locked', the gate shows regardless of this flag. */
  paywallOpen: boolean;
  set: (patch: Partial<Omit<ProState, 'set'>>) => void;
}

export const useProStore = create<ProState>()((set) => ({
  status: 'disabled',
  trialDaysLeft: 0,
  accountEmail: null,
  unattached: false,
  paywallOpen: false,
  set: (patch) => set(patch),
}));
