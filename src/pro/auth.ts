/**
 * Account layer — Supabase Auth.
 *
 * One account per player is what makes buy-once-everywhere work: the
 * Supabase user id becomes the RevenueCat App User ID (see entitlement.ts),
 * so a purchase from any channel (App Store, Play, Paddle on the website)
 * lands on the same person.
 *
 * Sign-in methods (all enabled in the Supabase dashboard):
 *   - Email magic link (no password to remember)
 *   - Sign in with Apple  (required by Apple once any social login exists)
 *   - Google
 */
import { Capacitor } from '@capacitor/core';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { PRO_ENABLED, SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

let client: SupabaseClient | null = null;

/** Lazily create the Supabase client. Null while Pro is disabled/unconfigured. */
export function supabase(): SupabaseClient | null {
  if (!PRO_ENABLED || SUPABASE_URL.startsWith('PLACEHOLDER')) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // The webview/app is long-lived; keep the session fresh silently.
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return client;
}

/** The signed-in user, or null (also null while Pro is disabled). */
export async function currentUser(): Promise<User | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

/** Email magic-link sign-in. The link lands back on the storefront domain,
 *  which redirects into the app (native deep link) or web app. */
export async function signInWithEmail(email: string): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      // In a browser context (web app, desktop webview, dev server) the link
      // must come back to THIS origin so supabase-js can pick the session up
      // from the URL (detectSessionInUrl). Native (Capacitor) can't receive
      // an http redirect, so it lands on the storefront until the deep link
      // (app.vtune.tuner://auth) is registered.
      // TODO(native): switch to the deep link on iOS/Android.
      emailRedirectTo: Capacitor.isNativePlatform()
        ? 'https://vtune-app.com/auth-callback.html'
        : window.location.origin,
    },
  });
  return { error: error?.message ?? null };
}

/** Verify the 6-digit code from the sign-in email — the native-friendly
 *  completion of signInWithEmail (magic links can't redirect back into the
 *  iOS/Android app, but a typed code works everywhere). Requires the
 *  Supabase "Magic Link" email template to include {{ .Token }}. */
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.verifyOtp({
    email,
    token: code.trim(),
    type: 'email',
  });
  return { error: error?.message ?? null };
}

/** OAuth sign-in (Apple / Google). On native this opens the system browser
 *  and returns via deep link; on web it redirects in-page. */
export async function signInWithProvider(
  provider: 'apple' | 'google',
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: 'Accounts are not available in this build.' };
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'https://vtune-app.com/auth/callback',
      // TODO(live): on iOS prefer the native Sign in with Apple sheet
      // (ASAuthorization) and hand the identity token to supabase via
      // signInWithIdToken — nicer UX and required-quality UX for review.
    },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const sb = supabase();
  if (sb) await sb.auth.signOut();
}

/** Subscribe to auth changes; returns an unsubscribe fn. No-op when disabled. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const sb = supabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
