/**
 * Open a URL in the user's real browser, from any of the five shells V-Tune
 * ships in.
 *
 * This exists because `window.open()` is not portable. A Tauri webview has no
 * concept of a second window to open into, so the call returns null and
 * *nothing happens at all* — no error, no console warning, no browser. That
 * is what stranded desktop users on the paywall: the trial ended, the Unlock
 * button was the only way forward, and clicking it was indistinguishable from
 * the app being frozen. Tauri routes these through the opener plugin instead.
 *
 * The return value matters as much as the opening. Every caller is a dead end
 * if the browser doesn't appear, so each one needs to be able to say so
 * rather than leave the user clicking. `false` means "tell them where to go
 * by hand".
 */
import { Capacitor } from '@capacitor/core';
import { isTauri } from '../audio/alwaysOnTop';

export async function openExternal(url: string): Promise<boolean> {
  if (isTauri()) {
    try {
      // Imported on demand: the plugin only resolves inside Tauri, and the
      // web/PWA bundle has no reason to carry it.
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    // Capacitor's WebView hands the URL to the system browser but doesn't
    // return a usable window handle, so null there means nothing. In a real
    // browser null is meaningful: a popup blocker ate it.
    if (Capacitor.isNativePlatform()) return true;
    return opened !== null;
  } catch {
    return false;
  }
}
