import { useState, useEffect, useRef } from 'react'
import {
  getRecordingStats,
  getAllRecordings,
  generateCoachingReport,
  getRecording,
  uploadRecording,
} from '../api'
import CallAnalysis from '../components/Recording/CallAnalysis'

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'interested', label: 'Interested' },
  { value: 'needs_more_info', label: 'Needs More Info' },
  { value: 'scheduling_next', label: 'Scheduling Next' },
  { value: 'requesting_contract', label: 'Requesting Contract' },
  { value: 'follow_up_needed', label: 'Follow-Up Needed' },
  { value: 'not_a_fit', label: 'Not a Fit' },
]

export default function MeetingNotesPage() {
  const [stats, setStats] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [coaching, setCoaching] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [coachingError, setCoachingError] = useState(null)
  const [activeSection, setActiveSection] = useState('meetings')
  const [expandedRecordingId, setExpandedRecordingId] = useState(null)
  const [expandedRecording, setExpandedRecording] = useState(null)

  const [filterOutcome, setFilterOutcome] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [uploadLeadId, setUploadLeadId] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, recordingsRes] = await Promise.all([
        getRecordingStats().catch(() => ({ data: {} })),
        getAllRecordings().catch(() => ({ data: [] })),
      ])
      setStats(statsRes.data || {})
      setRecordings(recordingsRes.data || [])
    } catch (err) {
      console.error('Failed to load meeting notes:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateCoaching = async () => {
    setCoachingLoading(true)
    setCoachingError(null)
    try {
      const result = await generateCoachingReport()
      setCoaching(result.data)
    } catch (err) {
      setCoachingError(err.message)
    } finally {
      setCoachingLoading(false)
    }
  }

  const handleExpandRecording = async (id) => {
    if (expandedRecordingId === id) {
      setExpandedRecordingId(null)
      setExpandedRecording(null)
      return
    }
    setExpandedRecordingId(id)
    try {
      const result = await getRecording(id)
      setExpandedRecording(result.data)
    } catch (err) {
      console.error('Failed to load recording:', err)
    }
  }

  const handleUploadClick = () => {
    setUploadError(null)
    if (!uploadLeadId || isNaN(Number(uploadLeadId))) {
      setUploadError('Enter a Lead ID first.')
      return
    }
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError(null)
    setUploadStatus('Uploading...')
    try {
      await uploadRecording(Number(uploadLeadId), file, file.name)
      setUploadStatus('Uploaded. Transcription + analysis running in background — refresh in 30-60s.')
      setUploadLeadId('')
      setTimeout(() => {
        loadData()
        setUploadStatus(null)
      }, 4000)
    } catch (err) {
      setUploadError(err.message || 'Upload failed')
      setUploadStatus(null)
    }
  }

  const filteredRecordings = recordings.filter((r) => {
    if (filterOutcome && r.ai_outcome !== filterOutcome) return false
    if (filterDateFrom && r.created_at < filterDateFrom) return false
    if (filterDateTo && r.created_at > filterDateTo + 'T23:59:59') return false
    return true
  })

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        color: 'var(--text-secondary)',
      }}>
        Loading meeting notes...
      </div>
    )
  }

  const sections = [
    { key: 'meetings', label: 'Meetings' },
    { key: 'overview', label: 'Overview' },
    { key: 'coach', label: 'AI Coach' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Meeting Notes</h1>
        <p>AI-analyzed discovery meetings with MSP/ISP prospects</p>
      </div>

      {/* Upload guidance + lead-targeted upload */}
      <div className="card" style={{
        marginBottom: 'var(--space-xl)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Record your Google Meet or Zoom calls locally, then upload the audio file here for AI analysis.
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Lead ID
            </label>
            <input
              type="number"
              value={uploadLeadId}
              onChange={(e) => setUploadLeadId(e.target.value)}
              placeholder="e.g. 42"
              style={{ width: '120px' }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleUploadClick}>
            Upload Meeting Recording
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".m4a,.webm,.wav,.mp3,.ogg,audio/*"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          {uploadStatus && (
            <span style={{ fontSize: '12px', color: 'var(--color-info)' }}>{uploadStatus}</span>
          )}
          {uploadError && (
            <span style={{ fontSize: '12px', color: 'var(--color-error)' }}>{uploadError}</span>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-xs)',
        marginBottom: 'var(--space-xl)',
        borderBottom: '1px solid var(--border-default)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}>
        {sections.map((sec) => (
          <button
            key={sec.key}
            onClick={() => setActiveSection(sec.key)}
            className={`tab-button ${activeSection === sec.key ? 'active' : ''}`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* MEETINGS LIST */}
      {activeSection === 'meetings' && (
        <div>
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Outcome
                </label>
                <select
                  value={filterOutcome}
                  onChange={(e) => setFilterOutcome(e.target.value)}
                  style={{ width: '100%', minHeight: '44px' }}
                >
                  {OUTCOME_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  From
                </label>
                <input type="text" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: '130px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  To
                </label>
                <input type="text" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: '130px' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingBottom: 'var(--space-sm)' }}>
                {filteredRecordings.length} meeting{filteredRecordings.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="card">
            {filteredRecordings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
                No meetings yet. Upload a recording above to get started.
              </div>
            ) : (
              filteredRecordings.map((rec) => (
                <div key={rec.id} style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <div
                    onClick={() => handleExpandRecording(rec.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-lg)',
                      padding: 'var(--space-md) var(--space-lg)',
                      cursor: 'pointer',
                      background: expandedRecordingId === rec.id ? 'var(--bg-tertiary)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', width: '16px' }}>
                      {expandedRecordingId === rec.id ? '▼' : '▶'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>
                        {rec.business_name || `Lead #${rec.lead_id}`}
                      </span>
                      {rec.phone && (
                        <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-sm)', fontSize: '13px' }}>
                          {rec.phone}
                        </span>
                      )}
                    </div>
                    {rec.ai_outcome && (
                      <span style={{
                        color: getOutcomeColor(rec.ai_outcome),
                        fontWeight: 500,
                        fontSize: '12px',
                        textTransform: 'capitalize',
                      }}>
                        {rec.ai_outcome.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '50px', textAlign: 'right' }}>
                      {formatDuration(rec.duration_seconds)}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', minWidth: '90px', textAlign: 'right' }}>
                      {rec.created_at?.split('T')[0] || '-'}
                    </span>
                  </div>

                  {expandedRecordingId === rec.id && expandedRecording && (
                    <div style={{ padding: 'var(--space-lg)', paddingTop: 0, background: 'var(--bg-tertiary)' }}>
                      <CallAnalysis
                        recording={expandedRecording}
                        onLeadUpdated={() => loadData()}
                        onRecordingUpdated={() => handleExpandRecording(rec.id)}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div>
          <div className="grid grid-4 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
            <StatCard label="Total Meetings" value={stats?.total_calls || 0} />
            <StatCard label="Avg Duration" value={formatDuration(stats?.avg_duration || 0)} />
            <StatCard label="Avg Interest" value={stats?.avg_score ? `${Math.round(stats.avg_score / 10)}/10` : '-'} />
            <StatCard label="Conversion Rate" value={`${stats?.conversion_rate || 0}%`} color="var(--color-success)" />
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <StatCard label="Today" value={stats?.calls_today || 0} />
            <StatCard label="This Week" value={stats?.calls_this_week || 0} />
            <StatCard label="This Month" value={stats?.calls_this_month || 0} />
          </div>

          {stats?.outcome_breakdown?.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-lg)' }}>Outcome Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {stats.outcome_breakdown.map((item) => {
                  const total = stats.total_calls || 1
                  const pct = Math.round((item.count / total) * 100)
                  return (
                    <div key={item.outcome} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ width: '160px', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {(item.outcome || 'unknown').replace(/_/g, ' ')}
                      </span>
                      <div style={{ flex: 1, height: '20px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: getOutcomeColor(item.outcome),
                          borderRadius: 'var(--radius-sm)',
                          transition: 'width 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 'var(--space-sm)',
                        }}>
                          {pct > 10 && <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>{pct}%</span>}
                        </div>
                      </div>
                      <span style={{ width: '40px', fontSize: '13px', fontWeight: 600, textAlign: 'right' }}>
                        {item.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {stats?.total_calls === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
              No meeting recordings yet. Upload one above to see analytics here.
            </div>
          )}
        </div>
      )}

      {/* AI COACH */}
      {activeSection === 'coach' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
            <div>
              <h3>AI Coaching Report</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Holistic analysis of all your discovery meetings
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleGenerateCoaching} disabled={coachingLoading}>
              {coachingLoading ? 'Generating...' : coaching ? 'Refresh Report' : 'Generate Report'}
            </button>
          </div>

          {coachingError && (
            <div style={{
              padding: 'var(--space-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: '13px',
              marginBottom: 'var(--space-lg)',
            }}>
              {coachingError}
            </div>
          )}

          {coaching ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {coaching.overall_trend && (
                <div className="card" style={{
                  borderLeft: `3px solid ${coaching.overall_trend === 'improving' ? 'var(--color-success)' : coaching.overall_trend === 'stable' ? 'var(--color-info)' : 'var(--color-warning)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: coaching.overall_trend === 'improving' ? 'var(--color-success)' : coaching.overall_trend === 'stable' ? 'var(--color-info)' : 'var(--color-warning)',
                    }}>
                      {coaching.overall_trend === 'improving' ? 'Trending Up' : coaching.overall_trend === 'stable' ? 'Stable' : 'Needs Attention'}
                    </span>
                  </div>
                  {coaching.confidence_assessment && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
                      {coaching.confidence_assessment}
                    </p>
                  )}
                </div>
              )}

              {coaching.top_strengths?.length > 0 && (
                <CoachList title="Top Strengths" color="var(--color-success)" items={coaching.top_strengths} />
              )}
              {coaching.top_improvements?.length > 0 && (
                <CoachList title="Areas for Improvement" color="var(--color-warning)" items={coaching.top_improvements} />
              )}
              {coaching.script_suggestions?.length > 0 && (
                <CoachList title="Talking-Track Modifications" color="var(--accent-primary)" items={coaching.script_suggestions} />
              )}
              {coaching.objection_gaps?.length > 0 && (
                <CoachList title="Concerns Needing Better Responses" color="var(--color-error)" items={coaching.objection_gaps} />
              )}
              {coaching.next_steps?.length > 0 && (
                <div className="card" style={{ borderLeft: '3px solid var(--accent-primary)' }}>
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Next Steps</h3>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {coaching.next_steps.map((s, i) => (
                      <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : !coachingLoading && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
              Click "Generate Report" to get AI coaching insights based on all your recorded meetings.
              <br />
              <span style={{ fontSize: '12px' }}>Requires Anthropic API key in Settings and at least one recorded meeting.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function CoachList({ title, color, items }) {
  return (
    <div className="card">
      <h3 style={{ color, marginBottom: 'var(--space-md)' }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {items.map((s, i) => (
          <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
        ))}
      </ul>
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function getOutcomeColor(outcome) {
  const colors = {
    interested: 'var(--color-success)',
    scheduling_next: 'var(--color-success)',
    requesting_contract: 'var(--color-success)',
    needs_more_info: 'var(--color-info)',
    follow_up_needed: 'var(--color-warning)',
    not_a_fit: 'var(--color-error)',
  }
  return colors[outcome] || 'var(--accent-primary)'
}
