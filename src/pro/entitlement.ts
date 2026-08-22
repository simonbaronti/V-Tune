/**
 * Entitlement engine — decides 'pro' | 'trial' | 'locked' and keeps the
 * proStore in sync. The whole app asks one question ("is `pro` active?");
 * where the purchase happened (App Store, Play, Paddle via vtune-app.com)
 * is RevenueCat's problem, not ours.
 *
 * Platform split:
 *   - iOS/Android (Capacitor native) → @revenuecat/purchases-capacitor
 *   - Web + Tauri desktop            → @revenuecat/purchases-js
 * Both are keyed to the same App User ID = the Supabase user id, which is
 * what makes buy-once-everywhere work. Signed-out users are anonymous —
 * they can still buy on mobile (store account owns it; Restore works), but
 * cross-device unlock needs the account.
 */
import { Capacitor } from '@capacitor/core';
import { Purchases as NativePurchases } from '@revenuecat/purchases-capacitor';
import { Purchases as WebPurchases } from '@revenuecat/purchases-js';
import {
  PRO_ENABLED,
  TRIAL_DAYS,
  ENTITLEMENT_ID,
  RC_API_KEY_APPLE,
  RC_API_KEY_GOOGLE,
  RC_API_KEY_WEB,
} from './config';
import { currentUser, onAuthChange } from './auth';
import { useProStore } from './proStore';

// ── Trial clock ──────────────────────────────────────────────────────────
// Local first-run date. Deliberately "keep honest people honest" — a signed
// server-side check (Supabase profile row) can harden this later without
// changing the call sites.
const FIRST_RUN_KEY = 'v-tune-first-run';

function firstRunDate(): Date {
  const stored = localStorage.getItem(FIRST_RUN_KEY);
  if (stored) {
    const d = new Date(stored);
    if (!isNaN(d.getTime())) return d;
  }
  const now = new Date();
  localStorage.setItem(FIRST_RUN_KEY, now.toISOString());
  return now;
}

export function trialDaysLeft(): number {
  const elapsedMs = Date.now() - firstRunDate().getTime();
  const elapsedDays = Math.floor(elapsedMs / 86_400_000);
  return Math.max(0, TRIAL_DAYS - elapsedDays);
}

export function trialActive(): boolean {
  return trialDaysLeft() > 0;
}

// ── RevenueCat wiring ────────────────────────────────────────────────────
const isNative = Capacitor.isNativePlatform();
let nativeConfigured = false;

function rcKeyLooksReal(key: string): boolean {
  return !key.startsWith('PLACEHOLDER');
}

/** Configure RC (once) and pin it to the given app user id (or anonymous). */
async function configureRc(appUserId: string | null): Promise<void> {
  if (isNative) {
    const apiKey =
      Capacitor.getPlatform() === 'ios' ? RC_API_KEY_APPLE : RC_API_KEY_GOOGLE;
    if (!rcKeyLooksReal(apiKey)) return;
    if (!nativeConfigured) {
      await NativePurchases.configure({ apiKey, appUserID: appUserId });
      nativeConfigured = true;
    } else if (appUserId) {
      await NativePurchases.logIn({ appUserID: appUserId });
    } else {
      await NativePurchases.logOut().catch(() => {});
    }
    return;
  }
  // Web + Tauri desktop. purchases-js requires an app user id; RC's
  // anonymous-id helper covers the signed-out case.
  if (!rcKeyLooksReal(RC_API_KEY_WEB)) return;
  const id = appUserId ?? WebPurchases.generateRevenueCatAnonymousAppUserId();
  if (!WebPurchases.isConfigured()) {
    WebPurchases.configure({ apiKey: RC_API_KEY_WEB, appUserId: id });
  } else if (appUserId) {
    await WebPurchases.getSharedInstance().changeUser(appUserId);
  }
}

/** True when RevenueCat says the `pro` entitlement is active. */
async function entitlementActive(): Promise<boolean> {
  try {
    if (isNative) {
      if (!nativeConfigured) return false;
      const { customerInfo } = await NativePurchases.getCustomerInfo();
      return ENTITLEMENT_ID in customerInfo.entitlements.active;
    }
    if (!WebPurchases.isConfigured()) return false;
    const info = await WebPurchases.getSharedInstance().getCustomerInfo();
    return ENTITLEMENT_ID in info.entitlements.active;
  } catch {
    // Offline / RC unreachable: fail open onto the trial clock rather than
    // locking a paying customer out in a field with no signal. A cached
    // last-known-entitlement can harden this later.
    return false;
  }
}

// ── The one refresh the app calls ────────────────────────────────────────
export async function refreshProStatus(): Promise<void> {
  const store = useProStore.getState();
  if (!PRO_ENABLED) {
    store.set({ status: 'disabled' });
    return;
  }
  store.set({ status: 'loading' });

  const user = await currentUser();
  await configureRc(user?.id ?? null);

  const paid = await entitlementActive();
  if (paid) {
    store.set({ status: 'pro', accountEmail: user?.email ?? null });
    return;
  }
  if (trialActive()) {
    store.set({
      status: 'trial',
      trialDaysLeft: trialDaysLeft(),
      accountEmail: user?.email ?? null,
    });
    return;
  }
  store.set({ status: 'locked', accountEmail: user?.email ?? null });
}

/** Call once on app start: initial check + re-check whenever auth changes. */
export function initPro(): void {
  if (!PRO_ENABLED) {
    useProStore.getState().set({ status: 'disabled' });
    return;
  }
  void refreshProStatus();
  onAuthChange(() => void refreshProStatus());
}

/** Restore purchases (native store receipt sync), then re-evaluate. */
export async function restorePurchases(): Promise<void> {
  if (isNative && nativeConfigured) {
    await NativePurchases.restorePurchases().catch(() => {});
  }
  await refreshProStatus();
}
