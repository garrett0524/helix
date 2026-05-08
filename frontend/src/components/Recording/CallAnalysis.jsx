import { useState } from 'react'
import { applyAISuggestions, reanalyzeRecording } from '../../api'

const OUTCOME_COLORS = {
  interested: 'var(--color-success)',
  scheduling_next: 'var(--color-success)',
  requesting_contract: 'var(--color-success)',
  needs_more_info: 'var(--color-info)',
  follow_up_needed: 'var(--color-warning)',
  not_a_fit: 'var(--color-error)',
}

const CONFIDENCE_COLORS = {
  high: 'var(--color-success)',
  medium: 'var(--color-warning)',
  low: 'var(--color-error)',
}

export default function CallAnalysis({ recording, onLeadUpdated, onRecordingUpdated }) {
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  if (!recording) return null

  // The new prompt stores the full analysis JSON in ai_key_info; ai_auto_update
  // carries {suggested_stage, suggested_notes} for the apply-suggestions endpoint.
  const analysis = recording.ai_key_info || {}
  const autoUpdate = recording.ai_auto_update || {}
  const summary = recording.ai_summary || analysis.summary
  const outcome = recording.ai_outcome || analysis.outcome
  const mspDetails = analysis.msp_details || {}
  const keyPeople = Array.isArray(analysis.key_people) ? analysis.key_people : []
  const concerns = Array.isArray(analysis.concerns_raised) ? analysis.concerns_raised : []
  const nextSteps = Array.isArray(analysis.next_steps) ? analysis.next_steps : []
  const followUps = Array.isArray(analysis.follow_up_suggestions) ? analysis.follow_up_suggestions : []
  const dealPotential = analysis.deal_potential || {}
  const interestLevel = typeof analysis.interest_level === 'number' ? analysis.interest_level : null
  const timeline = analysis.timeline_discussed

  const hasAnalysis =
    !!summary ||
    !!outcome ||
    keyPeople.length > 0 ||
    concerns.length > 0 ||
    nextSteps.length > 0 ||
    Object.keys(mspDetails).some((k) => mspDetails[k] != null && mspDetails[k] !== '')

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

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      marginBottom: 'var(--space-md)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-lg)',
        flexWrap: 'wrap',
        gap: 'var(--space-sm)',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '15px' }}>Meeting Analysis</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            {recording.duration_seconds ? formatDuration(recording.duration_seconds) : '--:--'}
            {' | '}
            {recording.created_at ? recording.created_at.split('T')[0] : ''}
          </div>
        </div>
        {outcome && (
          <span style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '12px',
            fontWeight: 600,
            color: OUTCOME_COLORS[outcome] || 'var(--text-secondary)',
            background: `${OUTCOME_COLORS[outcome] || 'var(--text-secondary)'}20`,
          }}>
            {outcome.replace(/_/g, ' ').toUpperCase()}
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
      {summary && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Summary</SectionLabel>
          <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {summary}
          </p>
        </div>
      )}

      {/* Interest Level + Timeline + Deal Potential side-by-side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-lg)',
      }}>
        {interestLevel != null && (
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
          }}>
            <SectionLabel>Interest Level</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: '4px' }}>
              <div style={{ flex: 1, height: '8px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-full)' }}>
                <div style={{
                  height: '100%',
                  width: `${interestLevel * 10}%`,
                  background: interestLevel >= 7 ? 'var(--color-success)' : interestLevel >= 4 ? 'var(--color-warning)' : 'var(--color-error)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: interestLevel >= 7 ? 'var(--color-success)' : interestLevel >= 4 ? 'var(--color-warning)' : 'var(--color-error)',
              }}>
                {interestLevel}/10
              </span>
            </div>
          </div>
        )}

        {timeline && (
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
          }}>
            <SectionLabel>Timeline Discussed</SectionLabel>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '4px' }}>
              {timeline}
            </div>
          </div>
        )}

        {(dealPotential.estimated_locations != null || dealPotential.estimated_value || dealPotential.confidence) && (
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
          }}>
            <SectionLabel>Deal Potential</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px', fontSize: '13px' }}>
              {dealPotential.estimated_locations != null && (
                <div><span style={{ color: 'var(--text-tertiary)' }}>Est. locations:</span> <span style={{ fontWeight: 500 }}>{dealPotential.estimated_locations}</span></div>
              )}
              {dealPotential.estimated_value && (
                <div><span style={{ color: 'var(--text-tertiary)' }}>Value:</span> <span style={{ fontWeight: 500 }}>{dealPotential.estimated_value}</span></div>
              )}
              {dealPotential.confidence && (
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Confidence:</span>{' '}
                  <span style={{
                    fontWeight: 600,
                    color: CONFIDENCE_COLORS[dealPotential.confidence] || 'var(--text-secondary)',
                    textTransform: 'capitalize',
                  }}>
                    {dealPotential.confidence}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MSP Details */}
      {(mspDetails.locations_discussed != null
        || mspDetails.geographic_coverage
        || mspDetails.manages_wifi != null
        || (Array.isArray(mspDetails.hardware_mentioned) && mspDetails.hardware_mentioned.length > 0)) && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>MSP Details</SectionLabel>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-sm)',
          }}>
            {mspDetails.locations_discussed != null && (
              <InfoPill label="Locations" value={String(mspDetails.locations_discussed)} />
            )}
            {mspDetails.geographic_coverage && (
              <InfoPill label="Geo Coverage" value={mspDetails.geographic_coverage} />
            )}
            {mspDetails.manages_wifi != null && (
              <InfoPill
                label="Manages WiFi"
                value={mspDetails.manages_wifi === true ? 'Yes' : mspDetails.manages_wifi === false ? 'No' : 'Unknown'}
              />
            )}
          </div>
          {Array.isArray(mspDetails.hardware_mentioned) && mspDetails.hardware_mentioned.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginRight: '4px' }}>Hardware:</span>
              {mspDetails.hardware_mentioned.map((hw, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {hw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key People */}
      {keyPeople.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Key People ({keyPeople.length})</SectionLabel>
          {keyPeople.map((person, i) => (
            <div
              key={i}
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-sm) var(--space-md)',
                marginBottom: 'var(--space-xs)',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {person.name || 'Unknown'}
                {person.title && (
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> — {person.title}</span>
                )}
              </div>
              {person.role_in_decision && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {person.role_in_decision}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Concerns */}
      {concerns.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Concerns Raised</SectionLabel>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {concerns.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {nextSteps.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Next Steps</SectionLabel>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Follow-up Suggestions */}
      {followUps.length > 0 && (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <SectionLabel>Follow-Up Suggestions</SectionLabel>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {followUps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* AI Suggestions Apply */}
      {(autoUpdate.suggested_stage || autoUpdate.suggested_notes) && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-md)',
          marginBottom: 'var(--space-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}>
          {autoUpdate.suggested_stage && (
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>AI suggests stage: </span>
              <span style={{ fontWeight: 600, color: 'var(--accent-primary)', textTransform: 'capitalize' }}>
                {autoUpdate.suggested_stage.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          {autoUpdate.suggested_notes && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
              "{autoUpdate.suggested_notes}"
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {!applied ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleApplySuggestions}
                disabled={applying}
              >
                {applying
                  ? 'Applying...'
                  : autoUpdate.suggested_stage && autoUpdate.suggested_notes
                    ? 'Apply Stage + Append Notes'
                    : autoUpdate.suggested_stage
                      ? 'Apply Suggested Stage'
                      : 'Append Suggested Notes'}
              </button>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 500 }}>
                Applied
              </span>
            )}
          </div>
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
              whiteSpace: 'pre-wrap',
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
            {reanalyzing ? 'Reanalyzing...' : 'Reanalyze Meeting'}
          </button>
        </div>
      )}

      {/* No analysis available */}
      {!hasAnalysis && recording.status === 'complete' && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-md)',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
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
          gap: 'var(--space-md)',
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
      marginBottom: 'var(--space-sm)',
    }}>
      {children}
    </div>
  )
}

function InfoPill({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--space-xs) var(--space-sm)',
    }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{label}: </span>
      <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{value}</span>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
