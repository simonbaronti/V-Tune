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
  // anonymous-id helper covers the signed-out case. Persist the generated id
  // so signed-out sessions reuse ONE anonymous identity instead of minting a
  // new RC customer on every page load.
  if (!rcKeyLooksReal(RC_API_KEY_WEB)) return;
  const ANON_KEY = 'v-tune-rc-anon-id';
  let id = appUserId;
  if (!id) {
    id = localStorage.getItem(ANON_KEY) ?? null;
    if (!id) {
      id = WebPurchases.generateRevenueCatAnonymousAppUserId();
      localStorage.setItem(ANON_KEY, id);
    }
  }
  if (!WebPurchases.isConfigured()) {
    WebPurchases.configure({ apiKey: RC_API_KEY_WEB, appUserId: id });
  } else if (appUserId) {
    await WebPurchases.getSharedInstance().changeUser(appUserId);
  }
}

// Last app user id we attached an email to. RevenueCat stores attributes
// server-side, so this only needs doing once per signed-in session rather
// than on every status refresh.
let taggedUserId: string | null = null;

/**
 * Put the account's email on the RevenueCat customer.
 *
 * Without it the dashboard shows nothing but UUIDs, and finding the person
 * who emailed you about their unlock means a round-trip through Supabase to
 * translate an address into an id. That lookup is exactly where a
 * promotional entitlement ends up granted to the wrong row.
 *
 * Signed-in users only: an anonymous customer has no email to attach, and
 * gets aliased away the moment they do sign in. Never allowed to throw —
 * this is a convenience for us, and an unreachable RevenueCat must not stop
 * someone tuning.
 */
async function tagCustomerEmail(userId: string, email: string | null): Promise<void> {
  if (!email || taggedUserId === userId) return;
  try {
    if (isNative) {
      if (!nativeConfigured) return;
      await NativePurchases.setEmail({ email });
    } else {
      if (!WebPurchases.isConfigured()) return;
      await WebPurchases.getSharedInstance().setAttributes({ $email: email });
    }
    taggedUserId = userId;
  } catch {
    // Retried on the next refresh, since taggedUserId stays unset.
  }
}

// ── Offline grace ────────────────────────────────────────────────────────
// The last answer RevenueCat gave us, so an unreachable server doesn't
// present the paywall to somebody who has already paid. Falling back to the
// trial clock is no use here: by the time you've bought, the trial has long
// since expired, so "no network" and "never paid" looked identical and the
// app locked. A tuner in a workshop with no wifi is exactly who this
// protects, and exactly who was affected.
//
// Cached under the app user id so signing in as somebody else on a shared
// machine can't inherit their grace, and re-checked online whenever there
// IS a connection — so a refund still revokes access on the next check.
const ENTITLEMENT_CACHE_KEY = 'v-tune-entitlement-cache';
const OFFLINE_GRACE_DAYS = 30;

interface EntitlementCache {
  userId: string;
  pro: boolean;
  at: string;
}

function rememberEntitlement(userId: string, pro: boolean): void {
  try {
    const entry: EntitlementCache = { userId, pro, at: new Date().toISOString() };
    localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage unavailable (private window). Grace is a convenience, not a
    // guarantee — carry on without it.
  }
}

/** The cached answer, but only an unexpired `true` for this same user. */
function cachedEntitlement(userId: string): boolean {
  try {
    const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
    if (!raw) return false;
    const entry = JSON.parse(raw) as EntitlementCache;
    if (!entry?.pro || entry.userId !== userId) return false;
    const age = Date.now() - new Date(entry.at).getTime();
    if (!isFinite(age) || age < 0) return false;
    return age < OFFLINE_GRACE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * True when RevenueCat says the `pro` entitlement is active — or, when
 * RevenueCat can't be reached, when it said so recently enough.
 */
async function entitlementActive(userId: string): Promise<boolean> {
  try {
    let active: boolean;
    if (isNative) {
      // Not configured means configure() didn't complete, which offline is
      // a real possibility — treat it as "couldn't check", not "not paid".
      if (!nativeConfigured) return cachedEntitlement(userId);
      const { customerInfo } = await NativePurchases.getCustomerInfo();
      active = ENTITLEMENT_ID in customerInfo.entitlements.active;
    } else {
      if (!WebPurchases.isConfigured()) return cachedEntitlement(userId);
      const info = await WebPurchases.getSharedInstance().getCustomerInfo();
      active = ENTITLEMENT_ID in info.entitlements.active;
    }
    // Record both answers: a cached `false` is what lets a refund stick.
    rememberEntitlement(userId, active);
    return active;
  } catch {
    return cachedEntitlement(userId);
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
  if (user?.id) await tagCustomerEmail(user.id, user.email ?? null);

  const paid = await entitlementActive(user?.id ?? 'anonymous');
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
