import { useState } from 'react'
import TranscriptView from './TranscriptView'

const OUTCOME_STYLES = {
  interested: { color: '#10b981', label: 'Interested' },
  not_interested: { color: '#ef4444', label: 'Not Interested' },
  voicemail: { color: '#6b7280', label: 'Voicemail' },
  no_answer: { color: '#6b7280', label: 'No Answer' },
  callback: { color: '#f59e0b', label: 'Callback' },
  wrong_number: { color: '#ef4444', label: 'Wrong Number' },
};

export default function CallLog({ calls, onScheduleCallback }) {
  const [expandedId, setExpandedId] = useState(null);
  const [filterOutcome, setFilterOutcome] = useState('');

  const filteredCalls = filterOutcome
    ? calls.filter(c => c.outcome === filterOutcome)
    : calls;

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div>
      {/* Filter */}
      <div style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={{ width: '180px' }}>
          <option value="">All Outcomes</option>
          {Object.entries(OUTCOME_STYLES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Call List */}
      <div className="card">
        {filteredCalls.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-3xl)' }}>
            No calls recorded yet. Trigger a call from the outreach queue.
          </p>
        ) : (
          filteredCalls.map(call => {
            const outcomeStyle = OUTCOME_STYLES[call.outcome] || { color: '#6b7280', label: call.outcome };
            const isExpanded = expandedId === call.id;

            return (
              <div key={call.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                {/* Summary row */}
                <div
                  onClick={() => toggleExpand(call.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-lg)',
                    padding: 'var(--space-md) var(--space-lg)',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', width: '16px' }}>
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{call.business_name || `Lead #${call.lead_id}`}</span>
                    {call.phone && <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-sm)', fontSize: '13px' }}>{call.phone}</span>}
                  </div>
                  <span style={{ color: outcomeStyle.color, fontWeight: 500, fontSize: '13px' }}>
                    {outcomeStyle.label}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '60px', textAlign: 'right' }}>
                    {formatDuration(call.duration_seconds)}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', minWidth: '60px', textAlign: 'right' }}>
                    ${(call.cost || 0).toFixed(2)}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', minWidth: '100px', textAlign: 'right' }}>
                    {call.created_at?.split('T')[0] || '-'}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: 'var(--space-lg)', paddingTop: 0, background: 'var(--bg-tertiary)' }}>
                    {/* Recording placeholder */}
                    {call.recording_url ? (
                      <div style={{ marginBottom: 'var(--space-lg)' }}>
                        <h4 style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>Recording</h4>
                        <audio controls src={call.recording_url} style={{ width: '100%' }} />
                      </div>
                    ) : (
                      <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                        No recording available (mock call)
                      </div>
                    )}

                    {/* Transcript */}
                    {call.transcript && (
                      <TranscriptView transcript={call.transcript} />
                    )}

                    {/* Callback button */}
                    {call.outcome === 'callback' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onScheduleCallback(call)}
                        style={{ marginTop: 'var(--space-md)' }}
                      >
                        Schedule Callback
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
