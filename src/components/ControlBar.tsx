import { useTunerStore } from '../store/tunerStore';
import { startAudio, stopAudio } from '../audio/AudioEngine';

export function ControlBar() {
  const isRunning = useTunerStore((s) => s.isRunning);
  const inputDeviceId = useTunerStore((s) => s.inputDeviceId);

  const handleToggle = async () => {
    if (isRunning) {
      stopAudio();
    } else {
      await startAudio(inputDeviceId !== 'default' ? inputDeviceId : undefined);
    }
  };

  return (
    <div className="flex flex-col shrink-0" style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
      <div className="px-3 py-2">
        <button
          data-tour="lets-go"
          onClick={handleToggle}
          className="w-full flex items-center justify-center gap-2 py-3 rounded text-lg font-semibold tracking-wide transition-all"
          style={{ background: isRunning ? 'var(--accent-red)' : 'var(--accent-green)', color: '#000' }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Hammer */}
            <path d="M15 12 5.5 21.5a2.121 2.121 0 1 1-3-3L12 9" />
            <path d="M17.64 15 22 10.64" />
            <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
          </svg>
          <span>{isRunning ? 'STOP' : "Let's Go"}</span>
        </button>
      </div>
    </div>
  );
}
