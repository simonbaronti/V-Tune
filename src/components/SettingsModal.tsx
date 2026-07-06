import { useEffect, useState, type ReactNode } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { enumerateDevices, setMicGainDb, startAudio, stopAudio } from '../audio/AudioEngine';
import { ReferenceBar } from './ReferenceBar';

/** True on the narrow layout (<1024px) — phone + portrait tablet. */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** Teal section divider, matching the slide-out menu's icon-row accent. */
function Section({ title, children, dataTour }: { title: string; children: ReactNode; dataTour?: string }) {
  return (
    <div data-tour={dataTour}>
      <div
        className="px-4 py-1.5 text-xs font-bold tracking-wider uppercase text-center"
        style={{
          background: 'rgba(6, 182, 212, 0.12)',
          color: 'var(--text-secondary)',
          borderTop: '1px solid rgba(6, 182, 212, 0.25)',
          borderBottom: '1px solid rgba(6, 182, 212, 0.25)',
        }}
      >
        {title}
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

/** Two-column setting row: [title + description] | [control]. Stacks on
 *  very narrow screens. */
function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 items-center py-3"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        {description && (
          <div className="text-xs leading-snug mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 sm:justify-end flex-wrap">{children}</div>
    </div>
  );
}

export function SettingsModal() {
  const open = useTunerStore((s) => s.settingsOpen);
  const setOpen = useTunerStore((s) => s.setSettingsOpen);

  const isRunning = useTunerStore((s) => s.isRunning);
  const availableDevices = useTunerStore((s) => s.availableDevices);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);
  const micGainDb = useTunerStore((s) => s.micGainDb);
  const humFilter = useTunerStore((s) => s.humFilter);
  const strobeIntensity = useTunerStore((s) => s.strobeIntensity);
  const strobeSoftness = useTunerStore((s) => s.strobeSoftness);
  const strobeSpeed = useTunerStore((s) => s.strobeSpeed);
  const highContrast = useTunerStore((s) => s.highContrast);
  const largeText = useTunerStore((s) => s.largeText);

  const narrow = useIsNarrow();
  const [shown, setShown] = useState(false);

  // Populate the input list when the modal opens (mic permission is needed
  // to expose device labels), and keep it live while open.
  useEffect(() => {
    if (!open) return;
    const labelled = availableDevices.some((d) => d.label);
    enumerateDevices(!labelled);
    const onChange = () => enumerateDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Entrance animation + Esc-to-close.
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  if (!open) return null;

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    useTunerStore.getState().setInputDevice(deviceId);
    if (isRunning) {
      stopAudio();
      setTimeout(() => startAudio(deviceId !== 'default' ? deviceId : undefined), 100);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))',
        background: 'rgba(0, 0, 0, 0.55)',
        opacity: shown ? 1 : 0,
        transition: 'opacity 180ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col"
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '86vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
          transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            SETTINGS
          </span>
          <button
            data-tour="modal-close"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="w-8 h-8 rounded flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <span className="text-base leading-none">✕</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto min-h-0">
          {/* ── Input ─────────────────────────────────────────────── */}
          <Section title="Input" dataTour="modal-input">
            <Row title="Microphone" description="Select audio input device">
              <select
                data-tour="modal-mic"
                value={inputDeviceId}
                onChange={handleDeviceChange}
                className="w-full sm:w-52 rounded px-2 py-1.5 text-sm truncate"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                <option value="default">Default</option>
                {availableDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Input ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </Row>

            <Row title="Microphone Sensitivity" description="Adjust input gain">
              <input
                type="range"
                min="-12"
                max="30"
                step="1"
                value={micGainDb}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  useTunerStore.getState().setMicGainDb(v);
                  setMicGainDb(v);
                }}
                className="flex-1 sm:flex-none sm:w-40 h-1"
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              <span className="text-sm w-14 text-right tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {micGainDb > 0 ? '+' : ''}{micGainDb} dB
              </span>
            </Row>

            <Row title="Hum" description="Notches out mains hum from nearby power. UK/EU = 50, US = 60.">
              {(['off', '50', '60'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => useTunerStore.getState().setHumFilter(m)}
                  className="px-2.5 py-1 rounded text-sm transition-all"
                  style={{
                    background: humFilter === m ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                    color: humFilter === m ? '#a855f7' : 'var(--text-dim)',
                    border: humFilter === m ? '1px solid #a855f7' : '1px solid var(--border)',
                  }}
                >
                  {m === 'off' ? 'Off' : `${m} Hz`}
                </button>
              ))}
            </Row>
          </Section>

          {/* ── Tuning (narrow only — on wide these live in the menu) ─ */}
          {narrow && (
            <Section title="Tuning" dataTour="modal-tuning">
              <div className="py-2">
                <ReferenceBar />
              </div>
            </Section>
          )}

          {/* ── Strobe Preferences ───────────────────────────────── */}
          <Section title="Strobe Preferences" dataTour="modal-strobe">
            <Row title="Brightness" description="How vivid the red/green strobe bars are">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={strobeIntensity}
                onChange={(e) => useTunerStore.getState().setStrobeIntensity(parseFloat(e.target.value))}
                className="flex-1 sm:flex-none sm:w-40 h-1"
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              <span className="text-sm w-10 text-right tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {Math.round(strobeIntensity * 100)}%
              </span>
            </Row>

            <Row title="Blur" description="Edge softness of the bars — 0 is razor-sharp, higher feathers them">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={strobeSoftness}
                onChange={(e) => useTunerStore.getState().setStrobeSoftness(parseFloat(e.target.value))}
                className="flex-1 sm:flex-none sm:w-40 h-1"
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              <span className="text-sm w-10 text-right tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {Math.round(strobeSoftness * 100)}%
              </span>
            </Row>

            <Row title="Speed" description="How fast the strobe pattern reacts">
              {[0.5, 1, 2, 3, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => useTunerStore.getState().setStrobeSpeed(s)}
                  className="px-2.5 py-1 rounded text-sm transition-all"
                  style={{
                    background: strobeSpeed === s ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                    color: strobeSpeed === s ? '#a855f7' : 'var(--text-dim)',
                    border: strobeSpeed === s ? '1px solid #a855f7' : '1px solid var(--border)',
                  }}
                >
                  {s}x
                </button>
              ))}
            </Row>
          </Section>

          {/* ── Accessibility ────────────────────────────────────── */}
          <Section title="Accessibility Options" dataTour="modal-accessibility">
            <Row title="High contrast" description="Boost contrast for readability">
              <Toggle value={highContrast} onChange={(v) => useTunerStore.getState().setHighContrast(v)} />
            </Row>
            <Row title="Larger text" description="Increase text size across the app">
              <Toggle value={largeText} onChange={(v) => useTunerStore.getState().setLargeText(v)} />
            </Row>
            <Row title="Onboarding tour" description="Replay the guided walkthrough">
              <button
                onClick={() => {
                  const s = useTunerStore.getState();
                  s.setSettingsOpen(false);
                  s.setOnboardingDone(false);
                  s.setTourActive(true);
                }}
                className="text-sm px-3 py-1.5 rounded transition-colors"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Show tour again
              </button>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** iOS-style toggle switch. */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        position: 'relative',
        width: 38,
        height: 22,
        borderRadius: 999,
        background: value ? 'var(--accent-cyan)' : 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        transition: 'background 150ms ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: value ? '#fff' : 'var(--text-dim)',
          transition: 'left 150ms ease, background 150ms ease',
        }}
      />
    </button>
  );
}
