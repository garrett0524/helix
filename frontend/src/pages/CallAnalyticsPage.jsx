import { useState, useEffect } from 'react'
import {
  getRecordingStats,
  getRecordingTrends,
  getAllRecordings,
  generateCoachingReport,
  getRecording
} from '../api'
import CallAnalysis from '../components/Recording/CallAnalysis'

export default function CallAnalyticsPage() {
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [coaching, setCoaching] = useState(null)
  const [loading, setLoading] = useState(true)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [coachingError, setCoachingError] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [expandedRecordingId, setExpandedRecordingId] = useState(null)
  const [expandedRecording, setExpandedRecording] = useState(null)

  // Filters for call log
  const [filterOutcome, setFilterOutcome] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterScoreMin, setFilterScoreMin] = useState('')
  const [filterScoreMax, setFilterScoreMax] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, trendsRes, recordingsRes] = await Promise.all([
        getRecordingStats().catch(() => ({ data: {} })),
        getRecordingTrends().catch(() => ({ data: {} })),
        getAllRecordings().catch(() => ({ data: [] }))
      ])
      setStats(statsRes.data || {})
      setTrends(trendsRes.data || {})
      setRecordings(recordingsRes.data || [])
    } catch (err) {
      console.error('Failed to load analytics:', err)
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

  const filteredRecordings = recordings.filter(r => {
    if (filterOutcome && r.ai_outcome !== filterOutcome) return false
    if (filterDateFrom && r.created_at < filterDateFrom) return false
    if (filterDateTo && r.created_at > filterDateTo + 'T23:59:59') return false
    if (filterScoreMin && (r.ai_score == null || r.ai_score < Number(filterScoreMin))) return false
    if (filterScoreMax && (r.ai_score == null || r.ai_score > Number(filterScoreMax))) return false
    return true
  })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text-secondary)' }}>
        Loading analytics...
      </div>
    )
  }

  const sections = [
    { key: 'overview', label: 'Overview' },
    { key: 'objections', label: 'Objection Tracker' },
    { key: 'performance', label: 'Performance' },
    { key: 'coach', label: 'AI Coach' },
    { key: 'log', label: 'Call Log' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Call Analytics</h1>
        <p>Recording insights, AI analysis, and coaching</p>
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
        {sections.map(sec => (
          <button
            key={sec.key}
            onClick={() => setActiveSection(sec.key)}
            className={`tab-button ${activeSection === sec.key ? 'active' : ''}`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: Overview Stats */}
      {activeSection === 'overview' && (
        <div>
          <div className="grid grid-4 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
            <StatCard label="Total Calls" value={stats?.total_calls || 0} />
            <StatCard label="Avg Duration" value={formatDuration(stats?.avg_duration || 0)} />
            <StatCard label="Avg Quality Score" value={stats?.avg_score || 0} color={
              (stats?.avg_score || 0) >= 70 ? 'var(--color-success)' : (stats?.avg_score || 0) >= 40 ? 'var(--color-warning)' : 'var(--text-primary)'
            } />
            <StatCard label="Conversion Rate" value={`${stats?.conversion_rate || 0}%`} color="var(--color-success)" />
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <StatCard label="Calls Today" value={stats?.calls_today || 0} />
            <StatCard label="Calls This Week" value={stats?.calls_this_week || 0} />
            <StatCard label="Calls This Month" value={stats?.calls_this_month || 0} />
          </div>

          {/* Outcome Breakdown */}
          {stats?.outcome_breakdown?.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 'var(--space-lg)' }}>Outcome Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {stats.outcome_breakdown.map(item => {
                  const total = stats.total_calls || 1
                  const pct = Math.round((item.count / total) * 100)
                  return (
                    <div key={item.outcome} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ width: '120px', fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
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
                          paddingLeft: 'var(--space-sm)'
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
              No call recordings yet. Open a lead and record a call to see analytics here.
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: Objection Tracker */}
      {activeSection === 'objections' && (
        <div className="card">
          <h3 style={{ marginBottom: 'var(--space-lg)' }}>Objection Tracker</h3>
          {trends?.objection_trends?.length > 0 ? (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Objection</th>
                  <th>Frequency</th>
                  <th>Effective</th>
                  <th>Partial</th>
                  <th>Ineffective</th>
                  <th>Best Response</th>
                </tr>
              </thead>
              <tbody>
                {trends.objection_trends.map((obj, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500, maxWidth: '200px' }}>"{obj.objection}"</td>
                    <td>
                      <span style={{
                        background: 'var(--accent-primary)',
                        color: 'white',
                        borderRadius: 'var(--radius-full)',
                        padding: '2px 8px',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>
                        {obj.count}x
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-success)' }}>{obj.effective}</td>
                    <td style={{ color: 'var(--color-warning)' }}>{obj.partially_effective}</td>
                    <td style={{ color: 'var(--color-error)' }}>{obj.ineffective}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '250px' }}>
                      {obj.best_response || (obj.suggested_improvements?.[0] || '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
              No objection data yet. Record and analyze more calls to track objections.
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: Pitch Performance Over Time */}
      {activeSection === 'performance' && (
        <div>
          {/* Score over time - text-based chart */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Call Quality Score Over Time</h3>
            {trends?.score_history?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {trends.score_history.map(day => (
                  <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ width: '80px', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {day.date.substring(5)}
                    </span>
                    <div style={{ flex: 1, height: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.round(day.avg_score)}%`,
                        background: day.avg_score >= 70 ? 'var(--color-success)' : day.avg_score >= 40 ? 'var(--color-warning)' : 'var(--color-error)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 'var(--space-sm)',
                        transition: 'width 0.3s ease'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>
                          {Math.round(day.avg_score)}
                        </span>
                      </div>
                    </div>
                    <span style={{ width: '50px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      {day.call_count} call{day.call_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-tertiary)' }}>
                Not enough data yet.
              </div>
            )}
          </div>

          {/* Interest level over time */}
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Prospect Interest Level Over Time</h3>
            {trends?.interest_history?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {trends.interest_history.map(day => (
                  <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ width: '80px', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {day.date.substring(5)}
                    </span>
                    <div style={{ flex: 1, height: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${day.avg_interest * 10}%`,
                        background: day.avg_interest >= 7 ? 'var(--color-success)' : day.avg_interest >= 4 ? 'var(--color-info)' : 'var(--color-warning)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 'var(--space-sm)',
                        transition: 'width 0.3s ease'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>
                          {day.avg_interest}/10
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-tertiary)' }}>
                Not enough data yet.
              </div>
            )}
          </div>

          {/* Duration over time */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Average Call Duration Over Time</h3>
            {trends?.score_history?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {trends.score_history.map(day => {
                  const maxDur = Math.max(...trends.score_history.map(d => d.avg_duration || 0), 1)
                  return (
                    <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <span style={{ width: '80px', fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {day.date.substring(5)}
                      </span>
                      <div style={{ flex: 1, height: '24px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.round((day.avg_duration / maxDur) * 100)}%`,
                          background: 'var(--accent-primary)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 'var(--space-sm)',
                          transition: 'width 0.3s ease'
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'white' }}>
                            {formatDuration(Math.round(day.avg_duration))}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-tertiary)' }}>
                Not enough data yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: AI Coach */}
      {activeSection === 'coach' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
            <div>
              <h3>AI Coaching Report</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Holistic analysis of all your calls
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleGenerateCoaching}
              disabled={coachingLoading}
            >
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
              marginBottom: 'var(--space-lg)'
            }}>
              {coachingError}
            </div>
          )}

          {coaching ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              {/* Overall trend */}
              {coaching.overall_trend && (
                <div className="card" style={{
                  borderLeft: `3px solid ${coaching.overall_trend === 'improving' ? 'var(--color-success)' : coaching.overall_trend === 'stable' ? 'var(--color-info)' : 'var(--color-warning)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{
                      fontSize: '20px',
                      color: coaching.overall_trend === 'improving' ? 'var(--color-success)' : coaching.overall_trend === 'stable' ? 'var(--color-info)' : 'var(--color-warning)'
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

              {/* Strengths */}
              {coaching.top_strengths?.length > 0 && (
                <div className="card">
                  <h3 style={{ color: 'var(--color-success)', marginBottom: 'var(--space-md)' }}>Top Strengths</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {coaching.top_strengths.map((s, i) => (
                      <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {coaching.top_improvements?.length > 0 && (
                <div className="card">
                  <h3 style={{ color: 'var(--color-warning)', marginBottom: 'var(--space-md)' }}>Areas for Improvement</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {coaching.top_improvements.map((s, i) => (
                      <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Script Suggestions */}
              {coaching.script_suggestions?.length > 0 && (
                <div className="card">
                  <h3 style={{ color: 'var(--accent-primary)', marginBottom: 'var(--space-md)' }}>Script Modifications</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {coaching.script_suggestions.map((s, i) => (
                      <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Objection Gaps */}
              {coaching.objection_gaps?.length > 0 && (
                <div className="card">
                  <h3 style={{ color: 'var(--color-error)', marginBottom: 'var(--space-md)' }}>Objections Needing Better Responses</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {coaching.objection_gaps.map((s, i) => (
                      <li key={i} style={{ fontSize: '14px', lineHeight: 1.5 }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Optimal Call Times */}
              {coaching.optimal_call_times && (
                <div className="card">
                  <h3 style={{ marginBottom: 'var(--space-md)' }}>Optimal Call Times</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {coaching.optimal_call_times}
                  </p>
                </div>
              )}

              {/* Next Steps */}
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
              Click "Generate Report" to get AI coaching insights based on all your recorded calls.
              <br />
              <span style={{ fontSize: '12px' }}>Requires Anthropic API key in Settings and at least one recorded call.</span>
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: Call Log */}
      {activeSection === 'log' && (
        <div>
          {/* Filters */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: '120px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>Outcome</label>
                <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={{ width: '100%', minHeight: '44px' }}>
                  <option value="">All</option>
                  <option value="interested">Interested</option>
                  <option value="not_interested">Not Interested</option>
                  <option value="callback">Callback</option>
                  <option value="send_info">Send Info</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="no_answer">No Answer</option>
                  <option value="wrong_number">Wrong Number</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>From</label>
                <input type="text" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: '130px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>To</label>
                <input type="text" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="YYYY-MM-DD" style={{ width: '130px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>Score Min</label>
                <input type="number" value={filterScoreMin} onChange={e => setFilterScoreMin(e.target.value)} placeholder="0" style={{ width: '80px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>Score Max</label>
                <input type="number" value={filterScoreMax} onChange={e => setFilterScoreMax(e.target.value)} placeholder="100" style={{ width: '80px' }} />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingBottom: 'var(--space-sm)' }}>
                {filteredRecordings.length} recording{filteredRecordings.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Call list */}
          <div className="card">
            {filteredRecordings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-tertiary)' }}>
                No recordings found.
              </div>
            ) : (
              filteredRecordings.map(rec => (
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
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', width: '16px' }}>
                      {expandedRecordingId === rec.id ? '\u25BC' : '\u25B6'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{rec.business_name || `Lead #${rec.lead_id}`}</span>
                      {rec.phone && <span style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-sm)', fontSize: '13px' }}>{rec.phone}</span>}
                    </div>
                    {rec.ai_outcome && (
                      <span style={{
                        color: getOutcomeColor(rec.ai_outcome),
                        fontWeight: 500,
                        fontSize: '12px',
                        textTransform: 'capitalize'
                      }}>
                        {rec.ai_outcome.replace(/_/g, ' ')}
                      </span>
                    )}
                    {rec.ai_score != null && (
                      <span style={{
                        fontWeight: 600,
                        fontSize: '13px',
                        color: rec.ai_score >= 70 ? 'var(--color-success)' : rec.ai_score >= 40 ? 'var(--color-warning)' : 'var(--color-error)'
                      }}>
                        {rec.ai_score}
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
                      <CallAnalysis recording={expandedRecording} />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
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

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function getOutcomeColor(outcome) {
  const colors = {
    interested: 'var(--color-success)',
    not_interested: 'var(--color-error)',
    callback: 'var(--color-warning)',
    send_info: 'var(--color-info)',
    wrong_number: 'var(--color-error)',
    no_answer: 'var(--text-tertiary)',
    voicemail: 'var(--text-tertiary)',
  }
  return colors[outcome] || 'var(--accent-primary)'
}
