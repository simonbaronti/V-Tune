/**
 * "Turn your phone back" — shown only to a phone held in landscape.
 *
 * V-Tune stacks three strobe bands above an analyser above the picker, and a
 * phone on its side has about 400px of height for all of it. Rather than
 * degrade every one of those, ask for the orientation the layout is built for.
 *
 * The test is deliberately narrow, because two obvious ways of writing it are
 * both wrong:
 *
 *  - "landscape" alone would catch tablets, which is backwards. The wide
 *    layout switches on at 1024px, so a tablet gets the full desktop view in
 *    landscape and the mobile one in portrait — landscape is a tablet's
 *    *better* orientation, not its worse one.
 *  - "landscape and short" alone would catch a desktop browser window that
 *    happens to be wide and shallow.
 *
 * Requiring a coarse pointer as well as a short landscape viewport leaves
 * only the case meant: a touch device too short to lay out, i.e. a phone on
 * its side. There's no dismiss because there's nothing to dismiss to — the
 * notice goes as soon as the phone comes back upright.
 */
import { useEffect, useState } from 'react';

const QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';

export function RotateNotice() {
  const [showing, setShowing] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setShowing(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!showing) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Rotate your phone to portrait"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 px-8 text-center"
      style={{ background: 'var(--bg-primary)' }}
    >
      <style>{`
        @keyframes vt-rotate-hint {
          0%, 18%   { transform: rotate(-90deg); }
          42%, 100% { transform: rotate(0deg); }
        }
        .vt-rotate { animation: vt-rotate-hint 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .vt-rotate { animation: none; transform: rotate(0deg); }
        }
      `}</style>

      <svg
        className="vt-rotate"
        width="58"
        height="58"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent-cyan)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transformOrigin: '50% 50%' }}
      >
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <line x1="10.5" y1="18.6" x2="13.5" y2="18.6" />
      </svg>

      <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        V-Tune works best in portrait
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: '22rem' }}>
        Turn your phone upright to get the strobe, the analyser and the note
        picker on screen at once.
      </p>
    </div>
  );
}
