import { useState } from 'react'
import { applyAISuggestions, reanalyzeRecording } from '../../api'

const OUTCOME_COLORS = {
  interested: 'var(--color-success)',
  not_interested: 'var(--color-error)',
  callback: 'var(--color-warning)',
  send_info: 'var(--color-info)',
  wrong_number: 'var(--color-error)',
  no_answer: 'var(--text-tertiary)',
  voicemail: 'var(--text-tertiary)',
}

const EFFECTIVENESS_COLORS = {
  effective: 'var(--color-success)',
  partially_effective: 'var(--color-warning)',
  ineffective: 'var(--color-error)',
}

export default function CallAnalysis({ recording, onLeadUpdated, onRecordingUpdated }) {
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  if (!recording) return null

  const hasAnalysis = recording.ai_summary || recording.ai_score

  const handleReanalyze = async () => {
    setReanalyzing(true)
    try {
      await reanalyzeRecording(recording.id)
      if (onRecordingUpdated) onRecordingUpdated()
    } catch (err) {
      console.error('Reanalysis failed:', err)
    } finally {
      setReanalyzing(false)
    }
  }

  const handleApplySuggestions = async () => {
    setApplying(true)
    try {
      const result = await applyAISuggestions(recording.id)
      setApplied(true)
      if (onLeadUpdated) onLeadUpdated(result.data)
    } catch (err) {
      console.error('Failed to apply suggestions:', err)
    } finally {
      setApplying(false)
    }
  }

  const sentiment = recording.ai_sentiment || {}
  const pitchFeedback = recording.ai_pitch_feedback || {}
  const keyInfo = recording.ai_key_info || {}
  const autoUpdate = recording.ai_auto_update || {}
  const objections = recording.ai_objections || []

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      marginBottom: 'var(--space-md)'
    }}>
      {/* Header with score and outcome */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-lg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          {recording.ai_score != null && (
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '16px',
              background: recording.ai_score >= 70
                ? 'rgba(16, 185, 129, 0.15)'
                : recording.ai_score >= 40
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              color: recording.ai_score >= 70
                ? 'var(--color-success)'
                : recording.ai_score >= 40
                  ? 'var(--color-warning)'
                  : 'var(--color-error)',
              border: `2px solid ${recording.ai_score >= 70
                ? 'var(--color-success)'
                : recording.ai_score >= 40
                  ? 'var(--color-warning)'
                  : 'var(--color-error)'}`
            }}>
              {recording.ai_score}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>Call Analysis</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {recording.duration_seconds ? formatDuration(recording.duration_seconds) : '--:--'}
              {' | '}
              {recording.created_at ? recording.created_at.split('T')[0] : ''}
            </div>
          </div>
        </div>
        {recording.ai_outcome && (
          <span style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '12px',
            fontWeight: 600,
            color: OUTCOME_COLORS[recording.ai_outcome] || 'var(--text-secondary)',
            background: `${OUTCOME_COLORS[recording.ai_outcome] || 'var(--text-secondary)'}20`
          }}>
            {recording.ai_outcome.replace(/_/g, ' ').toUpperCase()}
          </span>
        )}
      </div>

      {/* Audio playback */}
      {recording.audio_path && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <audio
            controls
            src={`${import.meta.env.PROD ? '' : 'http://localhost:3001'}/${recording.audio_path.replace(/\\/g, '/')}`}
            style={{ width: '100%', height: '36px', borderRadius: 'var(--radius-md)' }}
          />
        </div>
      )}

      {/* Summary */}
      {recording.ai_summary && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Summary</SectionLabel>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {recording.ai_summary}
          </p>
        </div>
      )}

      {/* Sentiment gauges */}
      {(sentiment.prospect_interest_level || sentiment.garrett_confidence_level) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-lg)'
        }}>
          {sentiment.prospect_interest_level && (
            <GaugeBar label="Prospect Interest" value={sentiment.prospect_interest_level} max={10} />
          )}
          {sentiment.garrett_confidence_level && (
            <GaugeBar label="Your Confidence" value={sentiment.garrett_confidence_level} max={10} />
          )}
        </div>
      )}

      {/* Objections */}
      {objections.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Objections Detected ({objections.length})</SectionLabel>
          {objections.map((obj, i) => (
            <div key={i} style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-md)',
              marginBottom: 'var(--space-sm)',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  "{obj.objection}"
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: EFFECTIVENESS_COLORS[obj.effectiveness] || 'var(--text-tertiary)'
                }}>
                  {(obj.effectiveness || '').replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              {obj.response_given && (
                <div style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
                  Your response: {obj.response_given}
                </div>
              )}
              {obj.suggested_improvement && (
                <div style={{ color: 'var(--accent-primary)', fontStyle: 'italic' }}>
                  Suggestion: {obj.suggested_improvement}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pitch Feedback */}
      {(pitchFeedback.strengths?.length > 0 || pitchFeedback.weaknesses?.length > 0) && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Pitch Feedback</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
            {pitchFeedback.strengths?.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-success)', marginBottom: 'var(--space-xs)' }}>
                  Strengths
                </div>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {pitchFeedback.strengths.map((s, i) => <li key={i} style={{ marginBottom: '2px' }}>{s}</li>)}
                </ul>
              </div>
            )}
            {pitchFeedback.weaknesses?.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-warning)', marginBottom: 'var(--space-xs)' }}>
                  Areas to Improve
                </div>
                <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {pitchFeedback.weaknesses.map((w, i) => <li key={i} style={{ marginBottom: '2px' }}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
          {pitchFeedback.specific_suggestions?.length > 0 && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: 'var(--space-xs)' }}>
                Specific Suggestions
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {pitchFeedback.specific_suggestions.map((s, i) => <li key={i} style={{ marginBottom: '2px' }}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Key Info Captured */}
      {keyInfo && Object.values(keyInfo).some(v => v && (!Array.isArray(v) || v.length > 0)) && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Key Info Captured</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', fontSize: '13px' }}>
            {keyInfo.owner_name && <InfoPill label="Owner" value={keyInfo.owner_name} />}
            {keyInfo.best_callback_time && <InfoPill label="Callback Time" value={keyInfo.best_callback_time} />}
            {keyInfo.email && <InfoPill label="Email" value={keyInfo.email} />}
            {keyInfo.internet_speed && <InfoPill label="Internet Speed" value={keyInfo.internet_speed} />}
          </div>
          {keyInfo.concerns?.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Concerns: </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {keyInfo.concerns.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* AI Suggestions */}
      {autoUpdate.suggested_stage && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          marginBottom: 'var(--space-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>AI suggests moving to: </span>
            <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
              {autoUpdate.suggested_stage.replace(/_/g, ' ')}
            </span>
          </div>
          {!applied ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleApplySuggestions}
              disabled={applying}
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 500 }}>
              Applied
            </span>
          )}
        </div>
      )}

      {/* Transcript toggle */}
      {recording.transcript && (
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTranscript(!showTranscript)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {showTranscript ? 'Hide Transcript' : 'Show Full Transcript'}
          </button>
          {showTranscript && (
            <div style={{
              marginTop: 'var(--space-md)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              maxHeight: '300px',
              overflowY: 'auto',
              fontSize: '13px',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap'
            }}>
              {recording.transcript}
            </div>
          )}
        </div>
      )}

      {/* Reanalyze button for completed recordings */}
      {hasAnalysis && recording.status === 'complete' && recording.transcript && (
        <div style={{ marginTop: 'var(--space-sm)', textAlign: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleReanalyze}
            disabled={reanalyzing}
            style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}
          >
            {reanalyzing ? 'Reanalyzing...' : 'Reanalyze Call'}
          </button>
        </div>
      )}

      {/* No analysis available */}
      {!hasAnalysis && recording.status === 'complete' && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-md)',
          color: 'var(--text-tertiary)',
          fontSize: '13px'
        }}>
          <p style={{ marginBottom: 'var(--space-sm)' }}>No AI analysis available.</p>
          {recording.transcript ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleReanalyze}
              disabled={reanalyzing}
            >
              {reanalyzing ? 'Analyzing...' : 'Run AI Analysis'}
            </button>
          ) : (
            <span>Configure Anthropic API key in Settings.</span>
          )}
        </div>
      )}

      {/* Still processing */}
      {recording.status === 'transcribing' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--accent-primary)' }}>
          Transcribing audio...
        </div>
      )}
      {recording.status === 'analyzing' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--accent-primary)' }}>
          Running AI analysis...
        </div>
      )}

      {/* Error */}
      {recording.error_message && (
        <div style={{
          marginTop: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'rgba(239, 68, 68, 0.1)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: 'var(--color-error)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-md)'
        }}>
          <span>{recording.error_message}</span>
          {recording.transcript && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleReanalyze}
              disabled={reanalyzing}
              style={{ flexShrink: 0 }}
            >
              {reanalyzing ? 'Retrying...' : 'Retry Analysis'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '12px',
      fontWeight: 600,
      color: 'var(--text-tertiary)',
      textTransform: 'uppercase',
      marginBottom: 'var(--space-sm)'
    }}>
      {children}
    </div>
  )
}

function GaugeBar({ label, value, max }) {
  const pct = (value / max) * 100
  const color = pct >= 70 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-warning)' : 'var(--color-error)'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value}/{max}</span>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-full)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 'var(--radius-full)', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

function InfoPill({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--space-xs) var(--space-sm)'
    }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{label}: </span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
