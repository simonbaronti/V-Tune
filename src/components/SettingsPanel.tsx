import { useEffect } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { enumerateDevices, setMicGainDb, startAudio, stopAudio } from '../audio/AudioEngine';

/** Full-width labelled divider for the sub-sections inside Settings. The
 *  -mx-3 pulls it to the panel edges past the body's horizontal padding. */
function SectionHeading({ title }: { title: string }) {
  return (
    <div
      className="-mx-3 px-3 py-1.5 text-xs font-bold tracking-wider uppercase text-center"
      style={{
        background: 'rgba(6, 182, 212, 0.12)',
        color: 'var(--text-secondary)',
        borderTop: '1px solid rgba(6, 182, 212, 0.25)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.25)',
      }}
    >
      {title}
    </div>
  );
}

export function SettingsPanel() {
  const open = useTunerStore((s) => s.openAccordion === 'settings');

  const isRunning = useTunerStore((s) => s.isRunning);
  const availableDevices = useTunerStore((s) => s.availableDevices);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);
  const strobeSpeed = useTunerStore((s) => s.strobeSpeed);
  const micGainDb = useTunerStore((s) => s.micGainDb);
  const strobeIntensity = useTunerStore((s) => s.strobeIntensity);
  const strobeSoftness = useTunerStore((s) => s.strobeSoftness);
  const humFilter = useTunerStore((s) => s.humFilter);
  const highContrast = useTunerStore((s) => s.highContrast);
  const largeText = useTunerStore((s) => s.largeText);

  useEffect(() => {
    // Passive enumerate on mount + keep the list live as devices come and go.
    enumerateDevices(false);
    const onChange = () => enumerateDevices(false);
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, []);

  // Populate the input list automatically the moment the Settings accordion
  // opens — not on the first dropdown click. enumerateDevices() needs mic
  // permission to expose device names (a browser/WKWebView rule), and the
  // permission probe is async; doing it here means it completes while the
  // user is still moving toward the dropdown, so the very first time they
  // open it the real devices are already listed. (Previously the probe
  // fired on dropdown-open, so the list only appeared after a close/reopen.)
  useEffect(() => {
    if (!open) return;
    const labelled = availableDevices.some((d) => d.label);
    if (!labelled) enumerateDevices(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      className="shrink-0"
      style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}
    >
      <button
        data-tour="settings-header"
        onClick={() => useTunerStore.getState().toggleAccordion('settings')}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ background: 'transparent', color: 'var(--text-secondary)' }}
        aria-expanded={open}
      >
        <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          SETTINGS
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: 'var(--text-dim)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {/* ── Input ─────────────────────────────────────────────────── */}
          <SectionHeading title="Input" />

          <select
            data-tour="settings-input"
            value={inputDeviceId}
            onChange={handleDeviceChange}
            className="w-full rounded px-2 py-1.5 text-sm truncate"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <option value="default">Default</option>
            {availableDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>

          <div data-tour="settings-mic" className="flex items-center gap-2">
            <span className="text-sm shrink-0" style={{ color: 'var(--text-dim)' }} title="Input gain in decibels — 0 dB is unmodified, positive lifts a quiet mic">MIC +/−</span>
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
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-14 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {micGainDb > 0 ? '+' : ''}{micGainDb} dB
            </span>
          </div>

          {/* Mains-hum notch filter — lives in Input since it cleans the mic
              signal. Region: UK/EU = 50 Hz, US/CA/JP-east = 60 Hz. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--text-dim)' }}>HUM</span>
              {(['off', '50', '60'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => useTunerStore.getState().setHumFilter(m)}
                  className="px-2.5 py-1 rounded text-sm transition-all"
                  style={{
                    background: humFilter === m ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                    color: humFilter === m ? '#a855f7' : 'var(--text-dim)',
                    border: humFilter === m ? '1px solid #a855f7' : '1px solid transparent',
                  }}
                >
                  {m === 'off' ? 'Off' : `${m} Hz`}
                </button>
              ))}
            </div>
            <p className="text-xs leading-snug" style={{ color: 'var(--text-dim)' }}>
              Notches out mains hum from nearby power. UK/EU = 50, US = 60.
            </p>
          </div>

          {/* ── Strobe Preferences ────────────────────────────────────── */}
          <SectionHeading title="Strobe Preferences" />

          <div data-tour="settings-brightness" className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }} title="Brightness of the strobe — higher = more vivid red/green bars">BRIGHTNESS</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={strobeIntensity}
              onChange={(e) => useTunerStore.getState().setStrobeIntensity(parseFloat(e.target.value))}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-10 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(strobeIntensity * 100)}%
            </span>
          </div>

          <div data-tour="settings-blur" className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }} title="Softness of the red/green bar edges — 0 is razor-sharp, 100% is a feathered glow">BLUR</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={strobeSoftness}
              onChange={(e) => useTunerStore.getState().setStrobeSoftness(parseFloat(e.target.value))}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-10 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(strobeSoftness * 100)}%
            </span>
          </div>

          <div data-tour="settings-speed" className="flex items-center gap-2">
            <span className="text-sm mr-1" style={{ color: 'var(--text-dim)' }}>SPEED</span>
            {[0.5, 1, 2, 3, 5].map((s) => (
              <button
                key={s}
                onClick={() => useTunerStore.getState().setStrobeSpeed(s)}
                className="px-2.5 py-1 rounded text-sm transition-all"
                style={{
                  background: strobeSpeed === s ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  color: strobeSpeed === s ? '#a855f7' : 'var(--text-dim)',
                  border: strobeSpeed === s ? '1px solid #a855f7' : '1px solid transparent',
                }}
              >
                {s}x
              </button>
            ))}
          </div>


          {/* ── Accessibility Options ─────────────────────────────────── */}
          <SectionHeading title="Accessibility Options" />

          <label className="flex items-center justify-between gap-3 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <span>High contrast</span>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => useTunerStore.getState().setHighContrast(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: 'var(--accent-cyan)' }}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <span>Larger text</span>
            <input
              type="checkbox"
              checked={largeText}
              onChange={(e) => useTunerStore.getState().setLargeText(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: 'var(--accent-cyan)' }}
            />
          </label>

          {/* Replay onboarding tour */}
          <button
            onClick={() => {
              const s = useTunerStore.getState();
              s.setOnboardingDone(false);
              s.setTourActive(true);
            }}
            className="self-start text-xs px-2.5 py-1.5 rounded transition-colors"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Show tour again
          </button>
        </div>
      )}
    </div>
  );
}
