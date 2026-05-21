import { useEffect, useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { enumerateDevices, setMicGain, startAudio, stopAudio } from '../audio/AudioEngine';
import type { NoteNaming } from '../utils/notes';

const NAMING_LABELS: { value: NoteNaming; label: string }[] = [
  { value: 'sharp', label: '♯' },
  { value: 'flat', label: '♭' },
  { value: 'solfege', label: 'Do' },
  { value: 'german', label: 'DE' },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);

  const isRunning = useTunerStore((s) => s.isRunning);
  const availableDevices = useTunerStore((s) => s.availableDevices);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);
  const noteNaming = useTunerStore((s) => s.noteNaming);
  const displaySmoothing = useTunerStore((s) => s.displaySmoothing);
  const strobeSpeed = useTunerStore((s) => s.strobeSpeed);
  const readoutSmoothing = useTunerStore((s) => s.readoutSmoothing);
  const micGain = useTunerStore((s) => s.micGain);
  const inTuneHysteresis = useTunerStore((s) => s.inTuneHysteresis);
  const strobeIntensity = useTunerStore((s) => s.strobeIntensity);

  useEffect(() => {
    enumerateDevices();
    navigator.mediaDevices.addEventListener('devicechange', () => enumerateDevices());
  }, []);

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
        onClick={() => setOpen(!open)}
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
        <div className="px-3 py-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <label className="flex items-center gap-2 text-sm min-w-0" style={{ color: 'var(--text-secondary)' }}>
            <span className="shrink-0">Input:</span>
            <select
              value={inputDeviceId}
              onChange={handleDeviceChange}
              className="rounded px-2 py-1 text-sm flex-1 min-w-0 max-w-full truncate"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              <option value="default">Default</option>
              {availableDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm mr-1" style={{ color: 'var(--text-dim)' }}>NOTES</span>
            {NAMING_LABELS.map((n) => (
              <button
                key={n.value}
                onClick={() => useTunerStore.getState().setNoteNaming(n.value)}
                className="px-2.5 py-1 rounded text-sm transition-all"
                style={{
                  background: noteNaming === n.value ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
                  color: noteNaming === n.value ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: noteNaming === n.value ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                }}
              >
                {n.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>MIC</span>
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.05"
              value={micGain}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                useTunerStore.getState().setMicGain(v);
                setMicGain(v);
              }}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-12 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {micGain.toFixed(2)}×
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }} title="Brightness of the white strobe bars when a note lights up">BRIGHT</span>
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

          <div className="flex items-center gap-2">
            <span className="text-sm mr-1" style={{ color: 'var(--text-dim)' }}>SPEED</span>
            {[1, 2, 5, 10].map((s) => (
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

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>SMOOTH</span>
            <input
              type="range"
              min="0"
              max="0.95"
              step="0.05"
              value={displaySmoothing}
              onChange={(e) => useTunerStore.getState().setDisplaySmoothing(parseFloat(e.target.value))}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-10 text-right" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(displaySmoothing * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>READOUT</span>
            <input
              type="range"
              min="0"
              max="0.99"
              step="0.01"
              value={readoutSmoothing}
              onChange={(e) => useTunerStore.getState().setReadoutSmoothing(parseFloat(e.target.value))}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-10 text-right" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(readoutSmoothing * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }} title="Extra cents past TOL the reading can drift before flipping red — kills boundary flicker">HYST</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={inTuneHysteresis}
              onChange={(e) => useTunerStore.getState().setInTuneHysteresis(parseFloat(e.target.value))}
              className="flex-1 h-1"
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="text-sm w-10 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {inTuneHysteresis.toFixed(1)}¢
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
