import { useEffect, useState } from 'react';
import { isTauri } from '../audio/alwaysOnTop';

/**
 * In-app auto-updater for the Tauri desktop builds (Windows / macOS /
 * Linux). On launch it asks the updater endpoint whether a newer signed
 * release exists; if so it shows an unobtrusive banner. One click downloads
 * + installs the update (with a progress bar) and relaunches into the new
 * version — no redownloading from the website, no reinstalling by hand.
 *
 * No-ops entirely outside Tauri (web/PWA auto-update via the service
 * worker; iOS/Android update through their stores / the Android banner).
 * The Tauri plugins are dynamically imported so they never enter the
 * browser/mobile bundle.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'downloading'; version: string; pct: number }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string };

// Kept module-scoped so we don't re-run the check on every mount / HMR.
let checkedThisSession = false;

export function DesktopUpdater() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  // The resolved Update object from the plugin, stashed for the install step.
  const [pendingUpdate, setPendingUpdate] = useState<unknown>(null);

  useEffect(() => {
    if (!isTauri() || checkedThisSession) return;
    checkedThisSession = true;

    let cancelled = false;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update || cancelled) return;
        setPendingUpdate(update);
        setPhase({
          kind: 'available',
          version: update.version,
          notes: (update.body ?? '').trim(),
        });
      } catch (err) {
        // Network error, no manifest yet, etc. — stay silent; we'll try
        // again next launch. (Don't nag the user about update-check failures.)
        console.warn('Update check failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    if (!pendingUpdate) return;
    const update = pendingUpdate as {
      version: string;
      downloadAndInstall: (
        cb: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
      ) => Promise<void>;
    };
    try {
      let total = 0;
      let downloaded = 0;
      setPhase({ kind: 'downloading', version: update.version, pct: 0 });
      await update.downloadAndInstall((e) => {
        if (e.event === 'Started') {
          total = e.data?.contentLength ?? 0;
        } else if (e.event === 'Progress') {
          downloaded += e.data?.chunkLength ?? 0;
          const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
          setPhase({ kind: 'downloading', version: update.version, pct });
        } else if (e.event === 'Finished') {
          setPhase({ kind: 'installing', version: update.version });
        }
      });
      // Installed — relaunch into the new version.
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('Update install failed:', err);
      setPhase({
        kind: 'error',
        message: 'Update failed to install. Try again, or download the latest version from v-tune-handpan.vercel.app.',
      });
    }
  };

  if (phase.kind === 'idle') return null;

  return (
    <div
      role="alert"
      className="fixed z-[100] flex flex-col gap-2 p-4 rounded-lg"
      style={{
        right: '20px',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        width: 'min(360px, calc(100vw - 40px))',
        background: 'rgba(10, 16, 22, 0.98)',
        border: '1px solid var(--accent-cyan, #06b6d4)',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {phase.kind === 'available' && (
        <>
          <div className="flex items-start gap-3">
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="var(--accent-cyan, #06b6d4)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                V-Tune {phase.version} is available
              </div>
              {phase.notes && (
                <div
                  className="text-xs mt-1 leading-snug"
                  style={{ color: 'var(--text-dim)', maxHeight: '4.5em', overflow: 'hidden' }}
                >
                  {phase.notes.split('\n')[0]}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setPhase({ kind: 'idle' })}
              className="text-xs font-medium px-3 py-1.5 rounded"
              style={{ color: 'var(--text-dim)', background: 'transparent' }}
            >
              Later
            </button>
            <button
              onClick={install}
              className="text-xs font-bold px-3 py-1.5 rounded"
              style={{ background: 'var(--accent-cyan, #06b6d4)', color: '#05222a' }}
            >
              Install &amp; Restart
            </button>
          </div>
        </>
      )}

      {phase.kind === 'downloading' && (
        <>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Downloading V-Tune {phase.version}… {phase.pct}%
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${phase.pct}%`,
                background: 'var(--accent-cyan, #06b6d4)',
                transition: 'width 120ms ease',
              }}
            />
          </div>
        </>
      )}

      {phase.kind === 'installing' && (
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Installing V-Tune {phase.version} — restarting…
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="flex items-start gap-3">
          <div className="text-sm" style={{ color: 'var(--text-primary)', flex: 1 }}>
            {phase.message}
          </div>
          <button
            onClick={() => setPhase({ kind: 'idle' })}
            aria-label="Dismiss"
            className="text-lg leading-none px-1"
            style={{ color: 'var(--text-dim)' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
