/**
 * Always-on-top wrapper for the Tauri desktop build. The web/PWA build has
 * no concept of window stacking, so we detect the Tauri runtime at call
 * time and no-op everywhere else.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` on `window`; the dynamic import of
 * `@tauri-apps/api/window` keeps the module out of the browser bundle path
 * unless it's actually reached (Vite tree-shakes it for the web build too).
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function applyAlwaysOnTop(on: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setAlwaysOnTop(on);
  } catch (err) {
    console.warn('always-on-top failed:', err);
  }
}
