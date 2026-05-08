import { useState, useEffect, useMemo } from 'react'
import {
  getLeadRecordings,
  createCalendarEvent,
  enrichLead,
  getApolloSequences,
  pushToApolloSequence,
} from '../../api'
import RecordingWidget from '../Recording/RecordingWidget'
import CallAnalysis from '../Recording/CallAnalysis'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};

// Phase 4 pipeline stages (matches schema CHECK constraint).
const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'outreach_sent', label: 'Outreach Sent' },
  { key: 'responded', label: 'Responded' },
  { key: 'discovery_call', label: 'Discovery Call' },
  { key: 'technical_review', label: 'Technical Review' },
  { key: 'contract_sent', label: 'Contract Sent' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'live', label: 'Live' },
  { key: 'dead', label: 'Dead' },
];

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'calls', label: 'Meetings' },
];

const EVENT_TYPES = [
  { key: 'callback', label: 'Callback' },
  { key: 'site_visit', label: 'Site Visit' },
  { key: 'follow_up_call', label: 'Follow-Up Call' },
  { key: 'follow_up_email', label: 'Follow-Up Email' },
  { key: 'custom', label: 'Custom' },
];

// Restricted to MSP-flavored categories per Phase 6 spec.
const CATEGORY_OPTIONS = ['ISP', 'MSP', 'IT Services', 'WISP', 'Enterprise IT'];

const GEO_REACH_OPTIONS = ['Local', 'Regional', 'Multi-State', 'National'];
const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '200+'];
const DEPLOYMENT_TIMELINE_OPTIONS = ['Immediate', '30 days', '60 days', '90+', 'TBD'];

// Phase 1 (auto) scoring contributing fields require us to recompute the
// discovery score whenever any of these change. They map directly to the
// Phase 2 rules in the spec.
function computeDiscoveryScore(fields) {
  let score = 0;
  if (Number(fields.estimated_locations) >= 50) score += 15;
  if (fields.compatible_hardware === true) score += 10;
  if (fields.manages_wifi === true) score += 10;
  if (fields.decision_maker_engaged === true) score += 10;
  if (fields.deployment_timeline === 'Immediate' || fields.deployment_timeline === '30 days') score += 5;
  return Math.min(50, score);
}

export default function LeadDetailModal({ lead: initialLead, onClose, onSave }) {
  const isMobile = useIsMobile();
  const [lead, setLead] = useState(initialLead);
  const [stage, setStage] = useState(lead.pipeline_stage || 'new');
  const [notes, setNotes] = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);

  // Editable core fields
  const [businessName, setBusinessName] = useState(lead.business_name || '');
  const [category, setCategory] = useState(lead.category || '');
  const [address, setAddress] = useState(lead.address || '');
  const [city, setCity] = useState(lead.city || '');
  const [state, setState] = useState(lead.state || 'NY');
  const [zip, setZip] = useState(lead.zip || '');
  const [phone, setPhone] = useState(lead.phone || '');
  const [website, setWebsite] = useState(lead.website || '');
  const [ownerName, setOwnerName] = useState(lead.owner_name || '');

  // Editable email/contact fields
  const [email, setEmail] = useState(lead.email || '');
  const [contactName, setContactName] = useState(lead.contact_name || '');
  const [contactTitle, setContactTitle] = useState(lead.contact_title || '');
  const [directPhone, setDirectPhone] = useState(lead.direct_phone || '');

  // MSP Profile fields (TASK-19)
  const [estimatedLocations, setEstimatedLocations] = useState(
    lead.estimated_locations != null ? String(lead.estimated_locations) : ''
  );
  const [hardwareVendors, setHardwareVendors] = useState(lead.hardware_vendors || '');
  const [managesWifi, setManagesWifi] = useState(Boolean(lead.manages_wifi));
  const [geographicReach, setGeographicReach] = useState(lead.geographic_reach || '');
  const [companySize, setCompanySize] = useState(lead.company_size || '');

  // Post-Discovery fields (TASK-20)
  const [compatibleHardware, setCompatibleHardware] = useState(Boolean(lead.compatible_hardware));
  const [deploymentTimeline, setDeploymentTimeline] = useState(lead.deployment_timeline || '');
  const [decisionMakerEngaged, setDecisionMakerEngaged] = useState(Boolean(lead.decision_maker_engaged));
  const [discoveryScore, setDiscoveryScore] = useState(
    lead.discovery_score != null ? Number(lead.discovery_score) : 0
  );
  // Once the user manually edits discovery_score, stop auto-overwriting until
  // another contributing field changes (then we resume auto-calc).
  const [discoveryManual, setDiscoveryManual] = useState(false);

  // Apollo enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState(null);

  // Apollo sequence push state (TASK-22, replaces legacy Instantly flow)
  const [showSequencePush, setShowSequencePush] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [selectedSequence, setSelectedSequence] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  const [loadingSequences, setLoadingSequences] = useState(false);

  // Schedule form state
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(getDefaultScheduleForm());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState(null);

  // Auto-recompute discovery_score whenever a contributing field changes,
  // unless the user has typed a manual override into the input.
  useEffect(() => {
    if (discoveryManual) return;
    const next = computeDiscoveryScore({
      estimated_locations: Number(estimatedLocations) || 0,
      compatible_hardware: compatibleHardware,
      manages_wifi: managesWifi,
      decision_maker_engaged: decisionMakerEngaged,
      deployment_timeline: deploymentTimeline,
    });
    setDiscoveryScore(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimatedLocations, compatibleHardware, managesWifi, decisionMakerEngaged, deploymentTimeline]);

  // Header rollup: auto_score (server-computed) + discovery_score (live), capped at 100.
  const totalLeadScore = useMemo(() => {
    const auto = Number(lead.auto_score || 0);
    return Math.min(100, auto + Number(discoveryScore || 0));
  }, [lead.auto_score, discoveryScore]);

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const result = await enrichLead(lead.id);
      if (result.data?.found === false) {
        setEnrichMsg({ type: 'warning', text: 'No contact found for this business' });
      } else {
        const updated = result.data;
        setEmail(updated.email || '');
        setContactName(updated.contact_name || '');
        setContactTitle(updated.contact_title || '');
        setDirectPhone(updated.direct_phone || '');
        setLead(prev => ({ ...prev, ...updated }));
        setEnrichMsg({ type: 'success', text: 'Enriched successfully!' });
      }
    } catch (err) {
      setEnrichMsg({ type: 'error', text: err.message || 'Enrichment failed' });
    } finally {
      setEnriching(false);
    }
  };

  const buildSavePayload = () => ({
    business_name: businessName,
    category,
    address,
    city,
    state,
    zip,
    phone,
    website,
    owner_name: ownerName,
    pipeline_stage: stage,
    notes,
    email,
    contact_name: contactName,
    contact_title: contactTitle,
    direct_phone: directPhone,
    // MSP Profile
    estimated_locations: estimatedLocations === '' ? null : Number(estimatedLocations),
    hardware_vendors: hardwareVendors,
    manages_wifi: managesWifi,
    geographic_reach: geographicReach,
    company_size: companySize,
    // Post-Discovery
    compatible_hardware: compatibleHardware,
    deployment_timeline: deploymentTimeline,
    decision_maker_engaged: decisionMakerEngaged,
    discovery_score: Number(discoveryScore) || 0,
  });

  const handleOpenSequencePush = async () => {
    setShowSequencePush(true);
    setPushMsg(null);
    setLoadingSequences(true);
    try {
      const res = await getApolloSequences();
      setSequences(res.data || []);
    } catch (err) {
      setPushMsg({ type: 'error', text: 'Failed to load sequences: ' + err.message });
    } finally {
      setLoadingSequences(false);
    }
  };

  const handlePushToSequence = async () => {
    if (!selectedSequence) return;
    setPushing(true);
    setPushMsg(null);
    try {
      // Persist pending edits first so the push reads current data.
      await onSave(lead.id, buildSavePayload());
      const res = await pushToApolloSequence([lead.id], selectedSequence);
      const pushedCount = res.pushed ?? res.added ?? 0;
      const skippedNoEmail = res.skipped_no_email ?? 0;
      if (pushedCount > 0) {
        setPushMsg({ type: 'success', text: 'Lead pushed to sequence!' });
        setLead(prev => ({ ...prev, email_status: 'sent', apollo_sequence_id: selectedSequence }));
      } else if (skippedNoEmail > 0) {
        setPushMsg({ type: 'warning', text: 'Lead has no email. Enrich first.' });
      } else {
        setPushMsg({ type: 'error', text: res.error || 'Push failed' });
      }
      setTimeout(() => setShowSequencePush(false), 1500);
    } catch (err) {
      setPushMsg({ type: 'error', text: err.message || 'Push failed' });
    } finally {
      setPushing(false);
    }
  };

  function getDefaultScheduleForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      event_type: 'callback',
      event_date: tomorrow.toISOString().split('T')[0],
      event_time: '14:00',
      duration_minutes: 15,
      description: '',
    };
  }

  useEffect(() => {
    if (activeTab === 'calls') {
      loadRecordings();
    }
  }, [activeTab, lead.id]);

  // Lazily fetch sequence list once so we can render the sequence name in the
  // "In sequence: <name>" line when apollo_sequence_id is set.
  useEffect(() => {
    if (lead.apollo_sequence_id && sequences.length === 0 && !loadingSequences) {
      (async () => {
        try {
          const res = await getApolloSequences();
          setSequences(res.data || []);
        } catch {
          /* non-fatal — fall back to id */
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.apollo_sequence_id]);

  const loadRecordings = async () => {
    setLoadingRecordings(true);
    try {
      const result = await getLeadRecordings(lead.id);
      setRecordings(result.data || []);
    } catch (err) {
      console.error('Failed to load recordings:', err);
    } finally {
      setLoadingRecordings(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(lead.id, buildSavePayload());
    setSaving(false);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleRecordingComplete = (recording) => {
    setRecordings(prev => [recording, ...prev]);
  };

  const handleLeadUpdated = (updatedLead) => {
    if (updatedLead.pipeline_stage) setStage(updatedLead.pipeline_stage);
    if (updatedLead.notes) setNotes(updatedLead.notes);
  };

  const handleScheduleChange = (field, value) => {
    setScheduleForm(prev => ({ ...prev, [field]: value }));
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleForm.event_date || !scheduleForm.event_time) {
      setScheduleMsg({ type: 'error', text: 'Date and time are required' });
      return;
    }

    setScheduleSaving(true);
    setScheduleMsg(null);
    try {
      const typeLabel = EVENT_TYPES.find(t => t.key === scheduleForm.event_type)?.label || 'Event';
      await createCalendarEvent({
        lead_id: lead.id,
        event_type: scheduleForm.event_type,
        title: `${typeLabel} - ${lead.business_name}`,
        description: scheduleForm.description,
        event_date: scheduleForm.event_date,
        event_time: scheduleForm.event_time,
        duration_minutes: scheduleForm.duration_minutes,
        auto_created: 0,
      });
      setScheduleMsg({ type: 'success', text: 'Event scheduled!' });
      setScheduleForm(getDefaultScheduleForm());
      setTimeout(() => {
        setShowSchedule(false);
        setScheduleMsg(null);
      }, 1200);
    } catch (err) {
      setScheduleMsg({ type: 'error', text: err.message || 'Failed to create event' });
    } finally {
      setScheduleSaving(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
    color: 'var(--text-primary)', fontSize: '14px', colorScheme: 'dark', width: '100%',
  };

  const labelStyle = {
    display: 'block', color: 'var(--text-secondary)', fontSize: '11px',
    fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase',
  };

  const cardStyle = {
    marginBottom: 'var(--space-xl)',
    padding: 'var(--space-lg)',
    background: 'var(--bg-tertiary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  };

  const cardHeaderStyle = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-md)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const emailStatus = lead.email_status || 'none';
  const sequenceName = lead.apollo_sequence_id
    ? (sequences.find(s => String(s.id) === String(lead.apollo_sequence_id))?.name)
    : null;

  // ── Schedule quick-add panel (shared across tabs) ──
  const schedulePanel = showSchedule && (
    <div style={{
      background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)',
      border: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Schedule Event for {lead.business_name}
        </span>
        <button onClick={() => { setShowSchedule(false); setScheduleMsg(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px' }}>
          &#10005;
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>Event Type</label>
          <select value={scheduleForm.event_type} onChange={e => handleScheduleChange('event_type', e.target.value)} style={inputStyle}>
            {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Duration (min)</label>
          <input type="number" value={scheduleForm.duration_minutes} onChange={e => handleScheduleChange('duration_minutes', Number(e.target.value))} min={5} max={480} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={scheduleForm.event_date} onChange={e => handleScheduleChange('event_date', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <input type="time" value={scheduleForm.event_time} onChange={e => handleScheduleChange('event_time', e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-md)' }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={scheduleForm.description}
          onChange={e => handleScheduleChange('description', e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {scheduleMsg && (
        <div style={{
          fontSize: '13px', marginBottom: 'var(--space-sm)',
          color: scheduleMsg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
        }}>
          {scheduleMsg.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowSchedule(false); setScheduleMsg(null); }}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={handleScheduleSubmit} disabled={scheduleSaving}>
          {scheduleSaving ? 'Scheduling...' : 'Schedule'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" style={{ maxWidth: '720px' }}>
        {/* Header */}
        {isMobile ? (
          /* Mobile header with back arrow */
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
            marginBottom: 'var(--space-lg)',
            paddingBottom: 'var(--space-md)',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '8px',
                minWidth: '44px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              aria-label="Go back"
            >
              &#8592;
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.business_name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                {lead.category || 'Uncategorized'} | Score {totalLeadScore}
              </p>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => setShowSchedule(!showSchedule)}
              style={{
                background: showSchedule ? 'var(--accent-primary)' : 'transparent',
                color: showSchedule ? 'white' : 'var(--accent-primary)',
                border: `1px solid var(--accent-primary)`,
                fontWeight: 600,
                fontSize: '12px',
                padding: '6px 10px',
                flexShrink: 0,
              }}
            >
              Schedule
            </button>
          </div>
        ) : (
          /* Desktop header */
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <h2>{lead.business_name}</h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '4px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: totalLeadScore >= 70 ? 'var(--color-success)' :
                         totalLeadScore >= 40 ? 'var(--color-warning)' :
                         'var(--text-secondary)',
                }}>
                  Score
                  <span style={{ fontSize: '15px', fontWeight: 700 }}>{totalLeadScore}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>/100</span>
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                {lead.category || 'Uncategorized'} {lead.city && ` | ${lead.city}, ${lead.state || 'NY'}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <button
                className="btn btn-sm"
                onClick={() => setShowSchedule(!showSchedule)}
                style={{
                  background: showSchedule ? 'var(--accent-primary)' : 'transparent',
                  color: showSchedule ? 'white' : 'var(--accent-primary)',
                  border: `1px solid var(--accent-primary)`,
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '6px 14px',
                }}
              >
                Schedule
              </button>
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '18px', padding: '4px 8px' }}>
                &#10005;
              </button>
            </div>
          </div>
        )}

        {/* Schedule panel (visible on both tabs) */}
        {schedulePanel}

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-xs)',
          marginBottom: 'var(--space-xl)',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: 0
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
            >
              {tab.label}
              {tab.key === 'calls' && recordings.length > 0 && (
                <span style={{
                  marginLeft: '6px',
                  fontSize: '11px',
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  borderRadius: 'var(--radius-full)',
                  padding: '1px 6px',
                  fontWeight: 600
                }}>
                  {recordings.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* DETAILS TAB */}
        {activeTab === 'details' && (
          <>
            {/* Editable Lead Info */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={labelStyle}>Business Name</label>
                <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  <option value="">Select category...</option>
                  {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Owner / Manager</label>
                <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Owner name" style={inputStyle} />
              </div>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={labelStyle}>Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label style={labelStyle}>State</label>
                  <input type="text" value={state} onChange={e => setState(e.target.value)} maxLength={2} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Zip</label>
                  <input type="text" value={zip} onChange={e => setZip(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input type="text" value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.example.com" style={inputStyle} />
              </div>
            </div>

            {/* Read-only metrics — google_rating, review_count, place_id intentionally hidden per Phase 6 spec */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
              <InfoField label="Lead Score" value={
                <span style={{
                  fontWeight: 700, fontSize: '18px',
                  color: totalLeadScore >= 70 ? 'var(--color-success)' :
                         totalLeadScore >= 40 ? 'var(--color-warning)' : 'var(--text-secondary)'
                }}>
                  {totalLeadScore}
                </span>
              } />
              <InfoField label="Auto Score" value={lead.auto_score || 0} />
              <InfoField label="Discovery Score" value={discoveryScore || 0} />
              <InfoField label="Added" value={lead.created_at ? lead.created_at.split('T')[0] : '-'} />
            </div>

            {/* Email & Contact Info */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Email & Contact</span>
                  <span className={`badge badge-email-${emailStatus}`} style={{ fontSize: '11px' }}>
                    {emailStatus}
                  </span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={handleEnrich}
                  disabled={enriching}
                  style={{
                    background: 'var(--gradient-primary)',
                    color: 'white',
                    border: 'none',
                    fontSize: '12px',
                    padding: '5px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {enriching ? 'Enriching...' : 'Enrich with Apollo'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Name</label>
                  <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Owner / Manager name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Title</label>
                  <input type="text" value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="e.g. Owner, Manager" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Direct Phone</label>
                  <input type="tel" value={directPhone} onChange={e => setDirectPhone(e.target.value)} placeholder="Direct / mobile phone" style={inputStyle} />
                </div>
              </div>

              {lead.enriched_at && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 'var(--space-sm)' }}>
                  Last enriched: {new Date(lead.enriched_at).toLocaleDateString()}
                </div>
              )}

              {enrichMsg && (
                <div style={{
                  fontSize: '12px', marginTop: 'var(--space-sm)',
                  color: enrichMsg.type === 'success' ? 'var(--color-success)' : enrichMsg.type === 'warning' ? 'var(--color-warning)' : 'var(--color-error)',
                }}>
                  {enrichMsg.text}
                </div>
              )}

              {/* Apollo Sequence push controls */}
              {lead.apollo_sequence_id ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 'var(--space-md)' }}>
                  In sequence: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {sequenceName || lead.apollo_sequence_id}
                  </span>
                </div>
              ) : email ? (
                !showSequencePush && (
                  <button
                    className="btn btn-sm"
                    onClick={handleOpenSequencePush}
                    style={{
                      marginTop: 'var(--space-md)',
                      background: 'transparent',
                      border: '1px solid var(--accent-primary)',
                      color: 'var(--accent-primary)',
                      fontSize: '12px',
                      padding: '5px 12px',
                    }}
                  >
                    Push to Sequence
                  </button>
                )
              ) : (
                <button
                  className="btn btn-sm"
                  disabled
                  title="No email on file"
                  style={{
                    marginTop: 'var(--space-md)',
                    background: 'transparent',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-tertiary)',
                    fontSize: '12px',
                    padding: '5px 12px',
                    cursor: 'not-allowed',
                  }}
                >
                  Push to Sequence
                </button>
              )}

              {/* Sequence picker inline */}
              {showSequencePush && (
                <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  {loadingSequences ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading sequences...</div>
                  ) : (
                    <>
                      <label style={labelStyle}>Select Sequence</label>
                      <select value={selectedSequence} onChange={e => setSelectedSequence(e.target.value)} style={{ ...inputStyle, marginBottom: 'var(--space-sm)' }}>
                        <option value="">Select a sequence...</option>
                        {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePushToSequence} disabled={!selectedSequence || pushing}>
                          {pushing ? 'Pushing...' : 'Push'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowSequencePush(false)}>Cancel</button>
                      </div>
                    </>
                  )}
                  {pushMsg && (
                    <div style={{ fontSize: '12px', marginTop: 'var(--space-sm)', color: pushMsg.type === 'success' ? 'var(--color-success)' : pushMsg.type === 'warning' ? 'var(--color-warning)' : 'var(--color-error)' }}>
                      {pushMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* MSP Profile card (TASK-19) */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>MSP Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label style={labelStyle}>Estimated Locations Managed</label>
                  <input
                    type="number"
                    min={0}
                    value={estimatedLocations}
                    onChange={e => setEstimatedLocations(e.target.value)}
                    placeholder="e.g. 25"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Hardware Vendors</label>
                  <input
                    type="text"
                    value={hardwareVendors}
                    onChange={e => setHardwareVendors(e.target.value)}
                    placeholder="e.g. Ubiquiti, Cisco"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Geographic Reach</label>
                  <select value={geographicReach} onChange={e => setGeographicReach(e.target.value)} style={inputStyle}>
                    <option value="">Select reach...</option>
                    {GEO_REACH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Company Size</label>
                  <select value={companySize} onChange={e => setCompanySize(e.target.value)} style={inputStyle}>
                    <option value="">Select size...</option>
                    {COMPANY_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                  <ToggleField
                    label="Manages Wi-Fi"
                    value={managesWifi}
                    onChange={setManagesWifi}
                  />
                </div>
              </div>
            </div>

            {/* Post-Discovery card (TASK-20) */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div style={cardHeaderStyle}>Post-Discovery</div>
                {discoveryManual && (
                  <button
                    onClick={() => setDiscoveryManual(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                    title="Resume auto-calculating discovery score"
                  >
                    Reset auto-calc
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)' }}>
                <div>
                  <label style={labelStyle}>Deployment Timeline</label>
                  <select value={deploymentTimeline} onChange={e => setDeploymentTimeline(e.target.value)} style={inputStyle}>
                    <option value="">Select timeline...</option>
                    {DEPLOYMENT_TIMELINE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>
                    Discovery Score (0-50)
                    {discoveryManual && (
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: '6px', textTransform: 'none' }}>
                        manual
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={discoveryScore}
                    onChange={e => {
                      setDiscoveryManual(true);
                      const v = e.target.value === '' ? 0 : Math.max(0, Math.min(50, Number(e.target.value)));
                      setDiscoveryScore(v);
                    }}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <ToggleField
                    label="Compatible Hardware"
                    value={compatibleHardware}
                    onChange={setCompatibleHardware}
                  />
                </div>
                <div>
                  <ToggleField
                    label="Decision Maker Engaged"
                    value={decisionMakerEngaged}
                    onChange={setDecisionMakerEngaged}
                  />
                </div>
              </div>
            </div>

            {/* Pipeline Stage */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                Pipeline Stage
              </label>
              <select value={stage} onChange={e => setStage(e.target.value)}>
                {STAGES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Add notes about this lead..."
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Contact History */}
            {(lead.calls?.length > 0 || lead.emails?.length > 0) && (
              <div style={{ marginBottom: 'var(--space-xl)' }}>
                <h3 style={{ marginBottom: 'var(--space-md)' }}>Contact History</h3>
                {lead.calls?.map(call => (
                  <div key={call.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', fontSize: '13px' }}>
                    Call: {call.outcome || 'unknown'} | {call.duration_seconds || 0}s | {call.created_at?.split('T')[0]}
                  </div>
                ))}
                {lead.emails?.map(email => (
                  <div key={email.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)', fontSize: '13px' }}>
                    Email: {email.status} | {email.sequence_name || 'direct'} | {email.sent_at?.split('T')[0]}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
              <button className="btn btn-secondary" onClick={onClose} style={isMobile ? { width: '100%' } : {}}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={isMobile ? { width: '100%' } : {}}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}

        {/* CALLS TAB */}
        {activeTab === 'calls' && (
          <div>
            {/* Recording Widget */}
            <RecordingWidget
              leadId={lead.id}
              onRecordingComplete={handleRecordingComplete}
            />

            {/* Recordings list */}
            {loadingRecordings ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                Loading recordings...
              </div>
            ) : recordings.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 'var(--space-3xl)',
                color: 'var(--text-tertiary)',
                fontSize: '13px'
              }}>
                No recordings yet. Click "Start Recording" above to record a meeting, or upload an existing audio file.
              </div>
            ) : (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>
                  Previous Recordings ({recordings.length})
                </h4>
                {recordings.map(rec => (
                  <CallAnalysis
                    key={rec.id}
                    recording={rec}
                    onLeadUpdated={handleLeadUpdated}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/**
 * Inline yes/no toggle styled with theme tokens. Mirrors the button-pair
 * pattern used elsewhere in the modal so we don't introduce a new control idiom.
 */
function ToggleField({ label, value, onChange }) {
  const buttonBase = {
    flex: 1,
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
  const activeStyle = {
    background: 'var(--accent-primary)',
    borderColor: 'var(--accent-primary)',
    color: 'white',
  };
  const inactiveStyle = {
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
  };

  return (
    <div>
      <label style={{
        display: 'block', color: 'var(--text-secondary)', fontSize: '11px',
        fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase',
      }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onChange(true)}
          style={{ ...buttonBase, ...(value === true ? activeStyle : inactiveStyle) }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          style={{ ...buttonBase, ...(value === false ? activeStyle : inactiveStyle) }}
        >
          No
        </button>
      </div>
    </div>
  );
}
