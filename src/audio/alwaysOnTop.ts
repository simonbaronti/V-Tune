/**
 * Tauri runtime detection. The web/PWA build has no desktop window APIs, so
 * callers gate desktop-only behaviour (e.g. the in-app updater) on this.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` on `window`.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
