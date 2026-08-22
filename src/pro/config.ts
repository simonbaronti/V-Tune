/**
 * V-Tune Pro configuration — the single place real keys drop into.
 *
 * Every value can be supplied via Vite env (VITE_*) or edited here. Until
 * they're real, PRO_ENABLED stays false and the whole Pro layer is inert:
 * no Supabase client is created, no RevenueCat configure() runs, no gate
 * renders — the app behaves exactly as the free 1.1.x builds.
 *
 * To go live you need (see the Phase 1 setup spec):
 *   - Supabase project URL + anon key            (supabase.com → Settings → API)
 *   - RevenueCat public SDK keys, one per store  (RC → Project → API keys)
 *   - The storefront URL (Paddle checkout lives there, not in the app)
 */

export const PRO_ENABLED: boolean =
  (import.meta.env.VITE_PRO_ENABLED ?? 'false') === 'true';

/** Days the app is fully unlocked before the paywall appears. */
export const TRIAL_DAYS = 14;

/** One-time unlock price, display only (the stores/Paddle own the real price). */
export const PRICE_DISPLAY = '£49.99';

/** Where the web purchase happens (Paddle checkout on the storefront). */
export const STORE_URL = 'https://vtune-app.com';

export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'PLACEHOLDER.supabase.co';
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'PLACEHOLDER_ANON_KEY';

/**
 * RevenueCat public SDK keys. Apple/Google keys go to the Capacitor SDK on
 * native; the Web Billing key goes to purchases-js on web + Tauri desktop.
 */
export const RC_API_KEY_APPLE: string =
  import.meta.env.VITE_RC_KEY_APPLE ?? 'PLACEHOLDER_appl_KEY';
export const RC_API_KEY_GOOGLE: string =
  import.meta.env.VITE_RC_KEY_GOOGLE ?? 'PLACEHOLDER_goog_KEY';
export const RC_API_KEY_WEB: string =
  import.meta.env.VITE_RC_KEY_WEB ?? 'PLACEHOLDER_rcb_KEY';

/** The entitlement identifier — must match the RevenueCat dashboard. */
export const ENTITLEMENT_ID = 'pro';

/** True once real (non-placeholder) config is present for the current layer. */
export function proConfigLooksReal(): boolean {
  return (
    PRO_ENABLED &&
    !SUPABASE_URL.startsWith('PLACEHOLDER') &&
    !SUPABASE_ANON_KEY.startsWith('PLACEHOLDER')
  );
}
