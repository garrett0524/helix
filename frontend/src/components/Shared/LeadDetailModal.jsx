import { useState, useEffect } from 'react'
import { getLeadRecordings, createCalendarEvent, enrichLead, getInstantlyCampaigns, pushToInstantly } from '../../api'
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

const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'interested', label: 'Interested' },
  { key: 'meeting_booked', label: 'Meeting Booked' },
  { key: 'closed', label: 'Closed' },
  { key: 'dead', label: 'Dead' },
];

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'calls', label: 'Calls' },
];

const EVENT_TYPES = [
  { key: 'callback', label: 'Callback' },
  { key: 'site_visit', label: 'Site Visit' },
  { key: 'follow_up_call', label: 'Follow-Up Call' },
  { key: 'follow_up_email', label: 'Follow-Up Email' },
  { key: 'custom', label: 'Custom' },
];

const EMAIL_STATUS_COLORS = {
  none: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af' },
  sent: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  opened: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
  replied: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  bounced: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
};

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

  // Apollo enrichment state
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState(null);

  // Campaign push state
  const [showCampaignPush, setShowCampaignPush] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Schedule form state
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(getDefaultScheduleForm());
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState(null);

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

  const handleOpenCampaignPush = async () => {
    setShowCampaignPush(true);
    setPushMsg(null);
    setLoadingCampaigns(true);
    try {
      const res = await getInstantlyCampaigns();
      setCampaigns(res.data || []);
    } catch (err) {
      setPushMsg({ type: 'error', text: 'Failed to load campaigns: ' + err.message });
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const handlePushToCampaign = async () => {
    if (!selectedCampaign) return;
    setPushing(true);
    setPushMsg(null);
    try {
      // Save any unsaved email/contact changes to DB first so the push reads fresh data
      await onSave(lead.id, {
        business_name: businessName, category, address, city, state, zip,
        phone, website, owner_name: ownerName, pipeline_stage: stage, notes,
        email, contact_name: contactName, contact_title: contactTitle, direct_phone: directPhone,
      });
      const res = await pushToInstantly([lead.id], selectedCampaign);
      if (res.pushed > 0) {
        setPushMsg({ type: 'success', text: 'Lead pushed to campaign!' });
        setLead(prev => ({ ...prev, email_status: 'sent', instantly_campaign_id: selectedCampaign }));
      } else if (res.skipped_no_email > 0) {
        setPushMsg({ type: 'warning', text: 'Lead has no email. Enrich first.' });
      } else {
        setPushMsg({ type: 'error', text: 'Push failed' });
      }
      setTimeout(() => setShowCampaignPush(false), 1500);
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
    await onSave(lead.id, {
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
    });
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
                {lead.category || 'Uncategorized'}
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
              <h2>{lead.business_name}</h2>
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
                <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Restaurant, Bar, Gym" style={inputStyle} />
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

            {/* Read-only metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
              <InfoField label="Lead Score" value={
                <span style={{
                  fontWeight: 700, fontSize: '18px',
                  color: lead.lead_score >= 70 ? 'var(--color-success)' :
                         lead.lead_score >= 40 ? 'var(--color-warning)' : 'var(--text-secondary)'
                }}>
                  {lead.lead_score || 0}
                </span>
              } />
              <InfoField label="Google Rating" value={lead.google_rating ? `${lead.google_rating} stars` : '-'} />
              <InfoField label="Attempts" value={lead.contact_attempts || 0} />
              <InfoField label="Added" value={lead.created_at ? lead.created_at.split('T')[0] : '-'} />
            </div>

            {/* Email & Contact Info */}
            <div style={{
              marginBottom: 'var(--space-xl)',
              padding: 'var(--space-lg)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Email & Contact</span>
                  {lead.email_status && lead.email_status !== 'none' && (
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: EMAIL_STATUS_COLORS[lead.email_status]?.bg || EMAIL_STATUS_COLORS.none.bg,
                      color: EMAIL_STATUS_COLORS[lead.email_status]?.color || EMAIL_STATUS_COLORS.none.color,
                    }}>
                      {lead.email_status}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-sm"
                  onClick={handleEnrich}
                  disabled={enriching}
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
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

              {/* Add to Campaign button */}
              {email && !lead.instantly_campaign_id && !showCampaignPush && (
                <button
                  className="btn btn-sm"
                  onClick={handleOpenCampaignPush}
                  style={{
                    marginTop: 'var(--space-md)',
                    background: 'transparent',
                    border: '1px solid var(--accent-primary)',
                    color: 'var(--accent-primary)',
                    fontSize: '12px',
                    padding: '5px 12px',
                  }}
                >
                  Add to Campaign
                </button>
              )}
              {!email && !lead.email && !showCampaignPush && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 'var(--space-sm)' }}>
                  Add an email to push to a campaign
                </div>
              )}
              {lead.instantly_campaign_id && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: 'var(--space-sm)' }}>
                  In Instantly campaign
                </div>
              )}

              {/* Campaign push inline */}
              {showCampaignPush && (
                <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  {loadingCampaigns ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading campaigns...</div>
                  ) : (
                    <>
                      <label style={labelStyle}>Select Campaign</label>
                      <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} style={{ ...inputStyle, marginBottom: 'var(--space-sm)' }}>
                        <option value="">Select a campaign...</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-primary btn-sm" onClick={handlePushToCampaign} disabled={!selectedCampaign || pushing}>
                          {pushing ? 'Pushing...' : 'Push'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCampaignPush(false)}>Cancel</button>
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
                No recordings yet. Click "Start Recording" above to record a call.
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
