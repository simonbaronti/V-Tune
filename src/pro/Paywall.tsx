/**
 * The Pro gate: a full-screen, non-dismissible paywall shown only when the
 * trial is over and the unlock hasn't been bought ('locked'), plus a small
 * dismissible trial-countdown banner for the final days ('trial', ≤3 left).
 *
 * One purchase button:
 *   - iOS/Android → the store purchase sheet via RevenueCat (single package)
 *   - Web/desktop → vtune-app.com (Paddle checkout), then Sign in to unlock
 * Plus Sign in / Restore for existing buyers.
 */
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Purchases as NativePurchases } from '@revenuecat/purchases-capacitor';
import { PRICE_DISPLAY, STORE_URL } from './config';
import { signInWithEmail, verifyEmailCode } from './auth';
import { refreshProStatus, restorePurchases } from './entitlement';
import { useProStore } from './proStore';

const isNative = Capacitor.isNativePlatform();

/** Buy on this platform: store sheet on native, storefront on web/desktop. */
async function buy(setBusy: (b: boolean) => void, setError: (e: string | null) => void) {
  setError(null);
  if (!isNative) {
    window.open(STORE_URL, '_blank');
    return;
  }
  setBusy(true);
  try {
    const { current } = await NativePurchases.getOfferings();
    const pkg = current?.availablePackages?.[0];
    if (!pkg) {
      setError('The store is not reachable right now. Please try again.');
      return;
    }
    await NativePurchases.purchasePackage({ aPackage: pkg });
    await refreshProStatus();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // User cancelling the sheet is not an error worth showing.
    if (err?.code !== '1' && !/cancel/i.test(err?.message ?? '')) {
      setError('Purchase did not complete. You have not been charged.');
    }
  } finally {
    setBusy(false);
  }
}

/**
 * Email sign-in: magic link + 6-digit code entry. The code path is what
 * completes sign-in inside the native apps, where the emailed link can't
 * redirect back into the app. Apple/Google OAuth buttons are deliberately
 * absent until those providers are configured in Supabase — dead social
 * buttons are an App Review rejection.
 */
function SignInPanel({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const magicLink = async () => {
    setError(null);
    const res = await signInWithEmail(email.trim());
    if (res.error) setError(res.error);
    else setSent(true);
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    const res = await verifyEmailCode(email.trim(), code);
    setBusy(false);
    if (res.error) setError('That code didn’t work — check it, or request a fresh email.');
    // Success needs no handling here: the auth listener refreshes Pro status
    // and the paywall re-renders (or disappears) on its own.
  };

  return (
    <div className="flex flex-col gap-2.5">
      {sent ? (
        <>
          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            We emailed <strong>{email}</strong> a sign-in link and a 6-digit
            code. Tap the link, or enter the code here:
          </p>
          <div className="flex gap-2 justify-center">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-28 rounded px-3 py-2 text-base text-center tracking-[0.3em] font-semibold"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
            <button
              onClick={() => void submitCode()}
              disabled={code.length !== 6 || busy}
              className="rounded px-3 py-2 text-sm font-semibold"
              style={{
                background: 'var(--accent-blue)',
                color: '#fff',
                opacity: code.length === 6 && !busy ? 1 : 0.4,
              }}
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 min-w-0 rounded px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          />
          <button
            onClick={() => void magicLink()}
            disabled={!email.includes('@')}
            className="rounded px-3 py-2 text-sm font-semibold"
            style={{
              background: 'var(--accent-blue)',
              color: '#fff',
              opacity: email.includes('@') ? 1 : 0.4,
            }}
          >
            Email me a code
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs text-center" style={{ color: '#ef4444' }}>{error}</p>
      )}
      <button
        onClick={onDone}
        className="text-xs underline self-center"
        style={{ color: 'var(--text-dim)' }}
      >
        Back
      </button>
    </div>
  );
}

/** Full-screen lock. Mounted always; renders only when status === 'locked'. */
export function ProGate() {
  const status = useProStore((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (status !== 'locked') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock V-Tune Pro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200, // above every other modal — this is the lock
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="flex flex-col gap-4 px-6 py-7 text-center"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xl font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
            V-TUNE <span style={{ color: '#a855f7' }}>PRO</span>
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your 14-day free trial has ended. One purchase unlocks V-Tune
            forever — on every device.
          </span>
        </div>

        {signingIn ? (
          <SignInPanel onDone={() => setSigningIn(false)} />
        ) : (
          <>
            <button
              onClick={() => void buy(setBusy, setError)}
              disabled={busy}
              className="rounded-lg px-4 py-3 text-base font-bold transition-transform hover:scale-[1.02]"
              style={{ background: '#22c55e', color: '#fff', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Opening store…' : `Unlock V-Tune Pro — ${PRICE_DISPLAY}`}
            </button>
            {!isNative && (
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                The purchase opens on vtune-app.com — sign in here afterwards
                and V-Tune unlocks.
              </span>
            )}
            {error && (
              <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>
            )}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setSigningIn(true)}
                className="text-sm underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                Sign in
              </button>
              <button
                onClick={() => void restorePurchases()}
                className="text-sm underline"
                style={{ color: 'var(--text-secondary)' }}
              >
                Restore purchase
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Small countdown banner for the last days of the trial. Dismissible per-launch. */
export function TrialBanner() {
  const status = useProStore((s) => s.status);
  const daysLeft = useProStore((s) => s.trialDaysLeft);
  const [dismissed, setDismissed] = useState(false);

  if (status !== 'trial' || daysLeft > 3 || dismissed) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 px-3 py-1.5 text-sm shrink-0"
      style={{
        background: 'rgba(168, 85, 247, 0.12)',
        borderBottom: '1px solid rgba(168, 85, 247, 0.35)',
        color: 'var(--text-primary)',
      }}
    >
      <span>
        {daysLeft === 0
          ? 'Last day of your free trial.'
          : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left of your free trial.`}{' '}
        Unlock V-Tune Pro for {PRICE_DISPLAY} — yours forever.
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-base leading-none px-1"
        style={{ color: 'var(--text-dim)' }}
      >
        ✕
      </button>
    </div>
  );
}
