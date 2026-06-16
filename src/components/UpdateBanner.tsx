import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * "A new version is available" banner for the Android direct-APK build.
 *
 * Sideloaded APKs don't get store auto-updates, so without this a user who
 * installed the .apk has no way to know a newer V-Tune exists short of
 * re-checking the website. On launch we ask the GitHub API for the latest
 * release tag, compare it to the running build, and — if it's newer — show
 * a dismissible banner that opens the download page.
 *
 * Scoped to Android only:
 *   - iOS updates through the App Store / TestFlight automatically.
 *   - Web / PWA auto-updates via the service worker.
 *   - Desktop (Tauri) will get a proper in-app auto-installer separately.
 */

const LATEST_RELEASE_API =
  'https://api.github.com/repos/simonbaronti/V-Tune/releases/latest';
const DOWNLOAD_URL = 'https://v-tune-handpan.vercel.app/#download';

/** Compare two dotted numeric versions. Returns true if `latest` > `current`. */
function isNewer(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export function UpdateBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    // Only the sideloaded Android build needs this — bail everywhere else.
    if (Capacitor.getPlatform() !== 'android') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(LATEST_RELEASE_API, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { tag_name?: string };
        const tag = data.tag_name;
        if (!tag || cancelled) return;

        const clean = tag.replace(/^v/, '');
        // Don't nag about a version the user already dismissed.
        if (localStorage.getItem('v-tune-update-dismissed') === clean) return;

        if (isNewer(clean, __APP_VERSION__)) setLatestVersion(clean);
      } catch {
        // Offline or API rate-limited — silently skip; we'll try next launch.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!latestVersion) return null;

  const dismiss = () => {
    localStorage.setItem('v-tune-update-dismissed', latestVersion);
    setLatestVersion(null);
  };

  return (
    <div
      role="status"
      className="fixed left-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        top: 'max(0.75rem, env(safe-area-inset-top))',
        transform: 'translateX(-50%)',
        width: 'calc(100vw - 24px)',
        maxWidth: '440px',
        background: 'rgba(10, 16, 22, 0.97)',
        border: '1px solid var(--accent-cyan, #06b6d4)',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <svg
        width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="var(--accent-cyan, #06b6d4)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }} aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          V-Tune {latestVersion} is available
        </div>
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
          You're on {__APP_VERSION__}
        </div>
      </div>
      <button
        onClick={() => window.open(DOWNLOAD_URL, '_blank')}
        className="text-xs font-bold px-3 py-1.5 rounded shrink-0"
        style={{ background: 'var(--accent-cyan, #06b6d4)', color: '#05222a' }}
      >
        GET IT
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-lg leading-none px-1 shrink-0"
        style={{ color: 'var(--text-dim)' }}
      >
        ×
      </button>
    </div>
  );
}
