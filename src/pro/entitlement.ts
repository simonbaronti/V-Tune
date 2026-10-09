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
  rcKeyLooksReal,
} from './config';
import { currentUser, onAuthChange, signOut } from './auth';
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

/**
 * Put the trial's start date on the RevenueCat customer.
 *
 * The trial clock is a localStorage key and nothing else, which means that
 * from the outside there is no way to know whether somebody is on day two or
 * day thirteen — or how many people are mid-trial at all. Most trials never
 * create an account either, since none is required, so Supabase can't answer
 * it and the sign-up date wouldn't be the same question anyway.
 *
 * RevenueCat already has a customer for every install, anonymous ones
 * included, so attaching the date there costs nothing and makes the whole
 * trial cohort visible and filterable.
 *
 * `trial_ends` is worked out when the attribute is written, not read. If
 * TRIAL_DAYS ever changes it won't rewrite the dates already recorded —
 * which is the honest behaviour: those people really were given the old
 * length.
 *
 * Anonymous customers count here, so this is not gated on being signed in.
 * Never allowed to throw: this is reporting, and an unreachable RevenueCat
 * must not stop somebody tuning.
 */
let taggedTrialFor: string | null = null;

async function tagTrialStart(appUserId: string): Promise<void> {
  if (taggedTrialFor === appUserId) return;
  try {
    const started = firstRunDate();
    const ends = new Date(started.getTime() + TRIAL_DAYS * 86_400_000);
    const attributes = {
      trial_started: started.toISOString(),
      trial_ends: ends.toISOString(),
    };
    if (isNative) {
      if (!nativeConfigured) return;
      await NativePurchases.setAttributes(attributes);
    } else {
      if (!WebPurchases.isConfigured()) return;
      await WebPurchases.getSharedInstance().setAttributes(attributes);
    }
    taggedTrialFor = appUserId;
  } catch {
    // Retried on the next refresh, since taggedTrialFor stays unset.
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
/**
 * How long a verified unlock keeps working with no connection at all.
 *
 * Ninety days, not thirty, because of who actually uses this. A handpan is
 * tuned in a workshop, and workshops are sheds, barns and mountainsides —
 * the maker who reported the offline bug has no internet where he works at
 * all. Thirty days meant carrying a laptop somewhere with wifi every month
 * to prove a purchase he had already made.
 *
 * The window costs little. Refunds close after fourteen days, so past that
 * this is only catching chargebacks, which are rare and which revoke on the
 * next connection anyway. And it resets on every successful online check,
 * so it only ever runs down for somebody genuinely off-grid for a quarter.
 */
const OFFLINE_GRACE_DAYS = 90;

/**
 * The last account we positively identified.
 *
 * Supabase access tokens last about an hour, and getSession() refreshes an
 * expired one over the network. Offline that refresh fails and the session
 * comes back null — which is indistinguishable from being signed out unless
 * we write down who was here.
 *
 * Without this the offline grace below could never fire for the case it was
 * built for. The cache is keyed by account, the account resolved to
 * 'anonymous' the moment the network went away, the key never matched, and
 * somebody who had paid got the paywall in a workshop with no internet —
 * which is exactly where a handpan tuner works.
 *
 * Only ever used to look up a cached entitlement, never to grant a new one,
 * and cleared on a deliberate sign-out.
 */
const LAST_USER_KEY = 'v-tune-last-user';

interface LastUser {
  id: string;
  email: string | null;
}

function rememberUser(id: string, email: string | null): void {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id, email }));
  } catch {
    // Private window or storage disabled — the app still works online.
  }
}

function lastKnownUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as LastUser;
    return entry?.id ? entry : null;
  } catch {
    return null;
  }
}

interface EntitlementCache {
  userId: string;
  pro: boolean;
  at: string;
}

function rememberEntitlement(userId: string, pro: boolean): void {
  // An anonymous customer owns nothing worth remembering, and writing its
  // answer here would overwrite the entry belonging to a real account —
  // taking the offline grace away from the person who paid for it.
  if (userId === 'anonymous') return;
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
  if (user?.id) rememberUser(user.id, user.email ?? null);
  await configureRc(user?.id ?? null);
  if (user?.id) await tagCustomerEmail(user.id, user.email ?? null);
  await tagTrialStart(user?.id ?? 'anonymous');

  const paid = await entitlementActive(user?.id ?? 'anonymous');
  if (paid) {
    store.set({ status: 'pro', accountEmail: user?.email ?? null });
    return;
  }

  // Couldn't identify anybody, and nothing says they've paid. Before falling
  // through to the trial clock, consider that we may simply be offline: an
  // expired token with no network reads exactly like a signed-out user. If
  // the last account we did verify is still inside its offline grace, that's
  // who this is.
  //
  // Deliberately after the check above rather than instead of it, so an
  // account that really has been signed out of, or whose grace has run out,
  // still falls through to the paywall.
  if (!user) {
    const last = lastKnownUser();
    if (last && cachedEntitlement(last.id)) {
      store.set({ status: 'pro', accountEmail: last.email });
      return;
    }
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

/**
 * Sign out, and forget the offline identity with it.
 *
 * Use this rather than auth's signOut directly: leaving the remembered
 * account behind would hand the next person on the machine an unlock that
 * isn't theirs, which is the whole reason the cache is keyed by account.
 */
export async function signOutAndForget(): Promise<void> {
  try {
    localStorage.removeItem(LAST_USER_KEY);
    localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
  await signOut();
  await refreshProStatus();
}

/** Restore purchases (native store receipt sync), then re-evaluate. */
export async function restorePurchases(): Promise<void> {
  if (isNative && nativeConfigured) {
    await NativePurchases.restorePurchases().catch(() => {});
  }
  await refreshProStatus();
}
