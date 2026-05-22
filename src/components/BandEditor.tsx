import { useState } from 'react';
import { useTunerStore } from '../store/tunerStore';
import { updateWorkletTargets } from '../audio/AudioEngine';
import { NOTE_NAMES, getDisplayName } from '../utils/notes';

const OCTAVE_RANGE = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const selectStyle = {
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
};

export function BandEditor() {
  const bandConfigs = useTunerStore((s) => s.bandConfigs);
  const selectedBandId = useTunerStore((s) => s.selectedBandId);
  const currentNote = useTunerStore((s) => s.currentNote);
  const showBandEditor = useTunerStore((s) => s.openAccordion === 'bands');
  const noteNaming = useTunerStore((s) => s.noteNaming);

  const [addNote, setAddNote] = useState('A');
  const [addOctave, setAddOctave] = useState(4);

  const selectedConfig = selectedBandId
    ? bandConfigs.find((c) => c.id === selectedBandId)
    : null;

  const handleAdd = () => {
    useTunerStore.getState().addBandByNote(addNote, addOctave);
    updateWorkletTargets();
  };

  const handleRemove = () => {
    if (!selectedBandId) return;
    useTunerStore.getState().removeBand(selectedBandId);
    updateWorkletTargets();
  };

  const handleEditNote = (noteName: string) => {
    if (!selectedBandId || !selectedConfig) return;
    useTunerStore.getState().updateBandNote(selectedBandId, noteName, selectedConfig.octave);
    updateWorkletTargets();
  };

  const handleEditOctave = (octave: number) => {
    if (!selectedBandId || !selectedConfig) return;
    useTunerStore.getState().updateBandNote(selectedBandId, selectedConfig.noteName, octave);
    updateWorkletTargets();
  };

  const handleReset = () => {
    useTunerStore.getState().syncBandsToCurrentNote();
    updateWorkletTargets();
  };

  return (
    <div
      className="shrink-0"
      style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}
    >
      {/* Accordion header */}
      <button
        onClick={() => useTunerStore.getState().toggleAccordion('bands')}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ background: 'transparent', color: 'var(--text-secondary)' }}
        aria-expanded={showBandEditor}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            BANDS
          </span>
          <span className="text-sm px-2 py-0.5 rounded" style={{ color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.12)' }}>
            {bandConfigs.length}
          </span>
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
            transform: showBandEditor ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showBandEditor && (
      <div
        className="flex flex-col gap-2 px-4 pt-1 pb-3 overflow-y-auto"
        style={{ borderTop: '1px solid var(--border)', maxHeight: '260px' }}
      >
      {/* Add new band */}
      <div className="flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        <select
          value={addNote}
          onChange={(e) => setAddNote(e.target.value)}
          className="rounded px-2 py-1 text-sm"
          style={selectStyle}
        >
          {NOTE_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <select
          value={addOctave}
          onChange={(e) => setAddOctave(parseInt(e.target.value))}
          className="rounded px-2 py-1 text-sm"
          style={selectStyle}
        >
          {OCTAVE_RANGE.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <button
          onClick={handleAdd}
          className="px-3 py-1.5 rounded text-sm font-medium"
          style={{ background: 'rgba(6, 182, 212, 0.2)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
        >
          + ADD
        </button>
      </div>

      {/* Band chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {bandConfigs.map((config) => {
          const isSelected = selectedBandId === config.id;
          return (
            <button
              key={config.id}
              onClick={() => useTunerStore.getState().setSelectedBand(config.id)}
              className="px-3 py-1.5 rounded text-sm transition-all flex items-center gap-2"
              style={{
                background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-tertiary)',
                color: isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border)'}`,
              }}
              title={config.isFoundation ? 'Foundation band (locked)' : 'Custom band'}
            >
              {config.isFoundation && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.6 }}>
                  <rect x="5" y="11" width="14" height="10" rx="1.5"/>
                  <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
                </svg>
              )}
              <span className="font-medium">{getDisplayName(config.noteName, noteNaming)}{config.octave}</span>
              <span className="opacity-50 text-xs">{config.frequency.toFixed(1)}</span>
            </button>
          );
        })}

        {currentNote && (
          <button
            onClick={handleReset}
            className="px-2.5 py-1 rounded text-sm ml-1"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
            title="Reset bands to fundamental + octave + 5th"
          >
            RESET
          </button>
        )}
      </div>

      {/* Edit selected band */}
      {selectedConfig && (
        selectedConfig.isFoundation ? (
          <div
            className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-dim)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="1.5"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
            Foundation band — locked to the played note
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--text-dim)' }}>EDIT</span>

            <select
              value={selectedConfig.noteName}
              onChange={(e) => handleEditNote(e.target.value)}
              className="rounded px-2 py-1 text-sm"
              style={selectStyle}
            >
              {NOTE_NAMES.map((n) => (
                <option key={n} value={n}>{getDisplayName(n, noteNaming)}</option>
              ))}
            </select>

            <select
              value={selectedConfig.octave}
              onChange={(e) => handleEditOctave(parseInt(e.target.value))}
              className="rounded px-2 py-1 text-sm"
              style={selectStyle}
            >
              {OCTAVE_RANGE.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            <span className="text-sm opacity-60" style={{ color: 'var(--text-secondary)' }}>
              {selectedConfig.frequency.toFixed(2)} Hz
            </span>

            <button
              onClick={handleRemove}
              className="px-2.5 py-1 rounded text-sm ml-2"
              style={{ background: 'rgba(255, 59, 59, 0.15)', color: 'var(--accent-red)', border: '1px solid rgba(255, 59, 59, 0.3)' }}
            >
              DELETE
            </button>
          </div>
        )
      )}
      </div>
      )}
    </div>
  );
}
