import { useState, useEffect, useCallback, useRef } from 'react'
import StatsBar from '../components/Shared/StatsBar'
import KanbanBoard from '../components/Pipeline/KanbanBoard'
import LeadTable from '../components/Pipeline/LeadTable'
import LeadDetailModal from '../components/Shared/LeadDetailModal'
import TodayScheduleWidget from '../components/Calendar/TodayScheduleWidget'
import { getLeads, updateLead, createLead, enrichBulk, getEnrichBulkStatus, getInstantlyCampaigns, pushFilteredToInstantly } from '../api'

export default function PipelinePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [showAddLead, setShowAddLead] = useState(false);

  // Bulk action state
  const [showEnrichMenu, setShowEnrichMenu] = useState(false);
  const [showPushMenu, setShowPushMenu] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { title, message, done }
  const [campaigns, setCampaigns] = useState([]);
  const [showCampaignSelect, setShowCampaignSelect] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [pushFilter, setPushFilter] = useState('');
  const enrichMenuRef = useRef(null);
  const pushMenuRef = useRef(null);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (enrichMenuRef.current && !enrichMenuRef.current.contains(e.target)) setShowEnrichMenu(false);
      if (pushMenuRef.current && !pushMenuRef.current.contains(e.target)) setShowPushMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Enrichment confirmation state
  const [enrichConfirm, setEnrichConfirm] = useState(null); // { filter, preview }

  const handleBulkEnrich = async (filter) => {
    setShowEnrichMenu(false);
    setBulkProgress({ title: 'Checking Leads', message: 'Calculating credit usage...', done: false });
    try {
      // Dry run first to show credit estimate
      const preview = await enrichBulk({ filter, dryRun: true });
      setBulkProgress(null);
      if (preview.needs_enrichment === 0) {
        setBulkProgress({ title: 'Nothing to Enrich', message: `All ${preview.already_had_email} leads already have email addresses.`, done: true });
        return;
      }
      setEnrichConfirm({ filter, preview });
    } catch (err) {
      setBulkProgress({ title: 'Enrichment Failed', message: err.message, done: true });
    }
  };

  const enrichPollRef = useRef(null);

  const handleEnrichConfirmed = async () => {
    const { filter, preview } = enrichConfirm;
    const total = preview.needs_enrichment;
    setEnrichConfirm(null);
    setBulkProgress({ title: 'Enriching Leads', message: `Starting enrichment of ${total} leads...`, done: false, total, completed: 0 });
    try {
      await enrichBulk({ filter });
      // Start polling for progress
      enrichPollRef.current = setInterval(async () => {
        try {
          const status = await getEnrichBulkStatus();
          if (status.done) {
            clearInterval(enrichPollRef.current);
            enrichPollRef.current = null;
            setBulkProgress({
              title: 'Enrichment Complete',
              message: `Enriched: ${status.enriched || 0}, Not found: ${status.not_found || 0}, Already had email: ${status.already_had_email || 0}, Credits used: ${status.credits_used || 0}, Errors: ${status.errors || 0}`,
              done: true,
            });
            fetchLeads();
          } else {
            setBulkProgress({
              title: 'Enriching Leads',
              message: `${status.completed || 0} / ${status.total || total} leads processed — ${status.enriched || 0} enriched, ${status.credits_used || 0} credits used`,
              done: false,
              total: status.total || total,
              completed: status.completed || 0,
            });
          }
        } catch {
          // Polling error — keep trying
        }
      }, 3000);
    } catch (err) {
      setBulkProgress({ title: 'Enrichment Failed', message: err.message, done: true });
    }
  };

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (enrichPollRef.current) clearInterval(enrichPollRef.current);
    };
  }, []);

  const handleOpenPush = async (filter) => {
    setShowPushMenu(false);
    setPushFilter(filter);
    setBulkProgress({ title: 'Loading Campaigns', message: 'Fetching Instantly campaigns...', done: false });
    try {
      const res = await getInstantlyCampaigns();
      setCampaigns(res.data || []);
      setBulkProgress(null);
      setShowCampaignSelect(true);
    } catch (err) {
      setBulkProgress({ title: 'Failed', message: 'Could not load campaigns: ' + err.message, done: true });
    }
  };

  const handlePushConfirm = async () => {
    if (!selectedCampaign) return;
    setShowCampaignSelect(false);
    const campaignName = campaigns.find(c => c.id === selectedCampaign)?.name || 'campaign';
    setBulkProgress({ title: 'Pushing to Instantly', message: `Pushing leads to "${campaignName}"...`, done: false });
    try {
      const result = await pushFilteredToInstantly(pushFilter, selectedCampaign);
      setBulkProgress({
        title: 'Push Complete',
        message: `Pushed: ${result.pushed || 0}, Skipped (no email): ${result.skipped_no_email || 0}, Errors: ${result.errors || 0}`,
        done: true,
      });
      fetchLeads();
    } catch (err) {
      setBulkProgress({ title: 'Push Failed', message: err.message, done: true });
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      const result = await getLeads();
      setLeads(result.data || []);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleStageChange = async (leadId, newStage) => {
    try {
      await updateLead(leadId, { pipeline_stage: newStage });
      setLeads(prev => prev.map(l =>
        l.id === leadId ? { ...l, pipeline_stage: newStage } : l
      ));
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedLeads = [...leads].sort((a, b) => {
    const aVal = a[sortField] ?? '';
    const bVal = b[sortField] ?? '';
    const cmp = typeof aVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleCardClick = (lead) => {
    setSelectedLead(lead);
  };

  const handleLeadUpdate = async (id, data) => {
    try {
      await updateLead(id, data);
      await fetchLeads();
      setSelectedLead(null);
    } catch (err) {
      console.error('Failed to update lead:', err);
    }
  };

  const handleAddLead = async (data) => {
    try {
      await createLead(data);
      await fetchLeads();
      setShowAddLead(false);
    } catch (err) {
      console.error('Failed to create lead:', err);
      throw err;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', fontSize: '14px' }}>
        Loading pipeline...
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeInContent 0.3s ease' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div>
          <h1>Pipeline</h1>
          <p>Lead pipeline overview</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Enrich dropdown */}
          <div ref={enrichMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setShowEnrichMenu(!showEnrichMenu); setShowPushMenu(false); }}
              style={{ fontSize: '13px', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', border: 'none' }}
            >
              Enrich &#9662;
            </button>
            {showEnrichMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 100,
                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: '220px', overflow: 'hidden',
              }}>
                <button onClick={() => handleBulkEnrich('no_email')} style={dropdownItemStyle}>Enrich All Without Email</button>
                <button onClick={() => handleBulkEnrich('high_score')} style={dropdownItemStyle}>Enrich High Score (70+)</button>
              </div>
            )}
          </div>

          {/* Push to Instantly dropdown */}
          <div ref={pushMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setShowPushMenu(!showPushMenu); setShowEnrichMenu(false); }}
              style={{ fontSize: '13px' }}
            >
              Push to Instantly &#9662;
            </button>
            {showPushMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 100,
                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: '240px', overflow: 'hidden',
              }}>
                <button onClick={() => handleOpenPush('has_email_not_sent')} style={dropdownItemStyle}>Push All Ready (has email, not sent)</button>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={() => setShowAddLead(true)}
            style={{ flexShrink: 0 }}
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Bulk progress modal */}
      {bulkProgress && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => bulkProgress.done && setBulkProgress(null)}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', padding: 'var(--space-2xl)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>{bulkProgress.title}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: 'var(--space-lg)' }}>{bulkProgress.message}</p>
            {!bulkProgress.done && (
              <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{
                  width: bulkProgress.total ? `${Math.round((bulkProgress.completed || 0) / bulkProgress.total * 100)}%` : '30%',
                  height: '100%', background: 'var(--accent-primary)', borderRadius: '3px',
                  transition: 'width 0.5s ease',
                  ...(bulkProgress.total ? {} : { animation: 'pulse 1.5s ease-in-out infinite' }),
                }} />
              </div>
            )}
            {bulkProgress.done && (
              <button className="btn btn-primary" onClick={() => setBulkProgress(null)}>Close</button>
            )}
          </div>
        </div>
      )}

      {/* Campaign selection modal */}
      {showCampaignSelect && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCampaignSelect(false)}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', padding: 'var(--space-2xl)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-lg)' }}>Select Campaign</h3>
            <select
              value={selectedCampaign}
              onChange={e => setSelectedCampaign(e.target.value)}
              style={{ width: '100%', marginBottom: 'var(--space-lg)' }}
            >
              <option value="">Select a campaign...</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCampaignSelect(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePushConfirm} disabled={!selectedCampaign}>Push Leads</button>
            </div>
          </div>
        </div>
      )}

      {/* Enrichment credit confirmation modal */}
      {enrichConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEnrichConfirm(null)}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', padding: 'var(--space-2xl)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Confirm Enrichment</h3>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 'var(--space-sm)' }}>
                <strong>{enrichConfirm.preview.needs_enrichment}</strong> leads need enrichment
              </div>
              <div style={{ marginBottom: 'var(--space-sm)' }}>
                {enrichConfirm.preview.already_had_email > 0 && `${enrichConfirm.preview.already_had_email} already have email (skipped)`}
              </div>
              <div style={{
                padding: 'var(--space-md)',
                background: 'rgba(234,179,8,0.1)',
                border: '1px solid rgba(234,179,8,0.2)',
                borderRadius: 'var(--radius-md)',
                color: '#eab308',
                fontSize: '13px',
              }}>
                Up to <strong>{enrichConfirm.preview.max_credits}</strong> Apollo credits may be used for email reveals (1 credit per contact without a public email).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEnrichConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEnrichConfirmed}>Enrich {enrichConfirm.preview.needs_enrichment} Leads</button>
            </div>
          </div>
        </div>
      )}

      <TodayScheduleWidget />

      <StatsBar />

      <KanbanBoard
        leads={leads}
        onStageChange={handleStageChange}
        onCardClick={handleCardClick}
      />

      <LeadTable
        leads={sortedLeads}
        onRowClick={handleCardClick}
        onSort={handleSort}
        sortField={sortField}
        sortDir={sortDir}
        onLeadEnriched={fetchLeads}
      />

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onSave={handleLeadUpdate}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onSave={handleAddLead}
        />
      )}
    </div>
  );
}

const dropdownItemStyle = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '10px 16px', background: 'none', border: 'none',
  color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer',
  borderBottom: '1px solid var(--border-default)',
};

function AddLeadModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    business_name: '',
    category: '',
    owner_name: '',
    phone: '',
    address: '',
    city: '',
    state: 'NY',
    zip: '',
    website: '',
    notes: '',
    pipeline_stage: 'new',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.business_name.trim()) {
      setError('Business name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Failed to create lead');
      setSaving(false);
    }
  };

  const fieldStyle = { width: '100%', marginBottom: 0 };
  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-xs)',
    textTransform: 'uppercase',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: '520px', maxHeight: '85vh', overflow: 'auto', padding: 'var(--space-2xl)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 'var(--space-lg)' }}>Add Lead</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <div>
              <label style={labelStyle}>Business Name *</label>
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => handleChange('business_name', e.target.value)}
                placeholder="e.g. Joe's Pizza"
                autoFocus
                required
                style={fieldStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <label style={labelStyle}>Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  placeholder="e.g. Restaurant"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Owner Name</label>
                <input
                  type="text"
                  value={form.owner_name}
                  onChange={(e) => handleChange('owner_name', e.target.value)}
                  placeholder="e.g. Joe Smith"
                  style={fieldStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  placeholder="www.example.com"
                  style={fieldStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="123 Main St"
                style={fieldStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <label style={labelStyle}>City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="City"
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Zip</label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => handleChange('zip', e.target.value)}
                  placeholder="11701"
                  style={fieldStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Stage</label>
              <select
                value={form.pipeline_stage}
                onChange={(e) => handleChange('pipeline_stage', e.target.value)}
                style={fieldStyle}
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="interested">Interested</option>
                <option value="meeting_booked">Meeting Booked</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="How did you find this lead? Any context..."
                rows={3}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 'var(--space-md)',
              padding: 'var(--space-sm) var(--space-md)',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-xl)' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Add Lead'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
