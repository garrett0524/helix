import { useState, useEffect, useCallback, useRef } from 'react'
import StatsBar from '../components/Shared/StatsBar'
import KanbanBoard from '../components/Pipeline/KanbanBoard'
import LeadTable from '../components/Pipeline/LeadTable'
import LeadDetailModal from '../components/Shared/LeadDetailModal'
import TodayScheduleWidget from '../components/Calendar/TodayScheduleWidget'
import {
  getLeads,
  updateLead,
  createLead,
  enrichBulk,
  getEnrichBulkStatus,
  getApolloSequences,
  pushToApolloSequence,
  importLeads,
} from '../api'

export default function PipelinePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState(null);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [showAddLead, setShowAddLead] = useState(false);

  // Bumped on every leads mutation so StatsBar re-fetches.
  const [statsTick, setStatsTick] = useState(0);

  // Bulk action state
  const [showEnrichMenu, setShowEnrichMenu] = useState(false);
  const [showSequenceMenu, setShowSequenceMenu] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { title, message, done }
  const [sequences, setSequences] = useState([]);
  const [sequencesLoading, setSequencesLoading] = useState(false);
  const [sequencesError, setSequencesError] = useState('');
  const [toast, setToast] = useState(null); // { message }
  const enrichMenuRef = useRef(null);
  const sequenceMenuRef = useRef(null);

  // Row-level selection (drives "Push to Sequence")
  const [selectedIds, setSelectedIds] = useState(new Set());

  // CSV import
  const fileInputRef = useRef(null);
  const handleImportClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };
  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    // Reset the input so selecting the same file again still triggers onChange.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setBulkProgress({ title: 'Importing CSV', message: `Uploading ${file.name}...`, done: false });
    try {
      const result = await importLeads(file);
      setBulkProgress(null);
      // New response shape: { inserted, updated, skipped, total }.
      // Fall back to legacy `imported` key just in case the backend ever returns it.
      const ins = result.inserted ?? result.imported ?? 0;
      const upd = result.updated ?? 0;
      const skp = result.skipped ?? 0;
      setToast({ message: `Import: ${ins} inserted, ${upd} updated, ${skp} skipped` });
      fetchLeads();
    } catch (err) {
      setBulkProgress({ title: 'Import Failed', message: err.message || 'Unknown error', done: true });
    }
  };

  // Close dropdown menus on outside click
  useEffect(() => {
    const handler = (e) => {
      if (enrichMenuRef.current && !enrichMenuRef.current.contains(e.target)) setShowEnrichMenu(false);
      if (sequenceMenuRef.current && !sequenceMenuRef.current.contains(e.target)) setShowSequenceMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Enrichment confirmation state
  const [enrichConfirm, setEnrichConfirm] = useState(null); // { filter, preview }

  const handleBulkEnrich = async (filter) => {
    setShowEnrichMenu(false);
    setBulkProgress({ title: 'Checking Leads', message: 'Calculating credit usage...', done: false });
    try {
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

  // Lazy-load Apollo sequences when the dropdown is first opened.
  const handleOpenSequenceMenu = async () => {
    const next = !showSequenceMenu;
    setShowSequenceMenu(next);
    setShowEnrichMenu(false);
    if (!next) return;
    if (sequences.length > 0 || sequencesLoading) return;
    setSequencesLoading(true);
    setSequencesError('');
    try {
      const res = await getApolloSequences();
      setSequences(res.data || []);
    } catch (err) {
      setSequencesError(err.message || 'Failed to load sequences');
    } finally {
      setSequencesLoading(false);
    }
  };

  const handlePushToSequence = async (sequence) => {
    setShowSequenceMenu(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBulkProgress({ title: 'No Leads Selected', message: 'Tick at least one lead row before pushing to a sequence.', done: true });
      return;
    }
    setBulkProgress({ title: 'Pushing to Apollo', message: `Adding ${ids.length} lead(s) to "${sequence.name}"...`, done: false });
    try {
      const result = await pushToApolloSequence(ids, sequence.id);
      const pushed = result?.pushed ?? ids.length;
      setBulkProgress(null);
      setToast({ message: `Pushed ${pushed} lead${pushed === 1 ? '' : 's'} to ${sequence.name}` });
      setSelectedIds(new Set());
      fetchLeads();
    } catch (err) {
      setBulkProgress({ title: 'Push Failed', message: err.message, done: true });
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      const result = await getLeads();
      setLeads(result.data || []);
      setStatsTick(t => t + 1);
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
      setStatsTick(t => t + 1);
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
              onClick={() => { setShowEnrichMenu(!showEnrichMenu); setShowSequenceMenu(false); }}
              style={{ fontSize: '13px', background: 'linear-gradient(135deg, #8b5cf6, var(--accent-hover))', color: 'white', border: 'none' }}
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

          {/* Push to Apollo Sequence dropdown */}
          <div ref={sequenceMenuRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={handleOpenSequenceMenu}
              style={{ fontSize: '13px' }}
              disabled={selectedIds.size === 0}
              title={selectedIds.size === 0 ? 'Select leads first' : `Push ${selectedIds.size} lead(s)`}
            >
              Push to Sequence{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''} &#9662;
            </button>
            {showSequenceMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 100,
                background: 'var(--bg-card)', border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: '260px', maxHeight: '320px', overflowY: 'auto',
              }}>
                {sequencesLoading && (
                  <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    Loading sequences...
                  </div>
                )}
                {!sequencesLoading && sequencesError && (
                  <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-error)' }}>
                    {sequencesError}
                  </div>
                )}
                {!sequencesLoading && !sequencesError && sequences.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    No Apollo sequences found.
                  </div>
                )}
                {!sequencesLoading && !sequencesError && sequences.map(seq => (
                  <button
                    key={seq.id}
                    onClick={() => handlePushToSequence(seq)}
                    style={dropdownItemStyle}
                  >
                    {seq.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CSV Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-secondary"
            onClick={handleImportClick}
            style={{ fontSize: '13px', flexShrink: 0 }}
            title="Import MSP leads from CSV"
          >
            Import CSV
          </button>

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

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1100,
            background: 'var(--bg-card-elevated)',
            border: '1px solid var(--border-default)',
            borderLeft: '3px solid var(--color-success)',
            color: 'var(--text-primary)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-elevated)',
            fontSize: '13px',
            fontFamily: 'var(--font-body)',
            maxWidth: '360px',
          }}
        >
          {toast.message}
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

      <StatsBar refreshKey={statsTick} />

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
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
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
                placeholder="e.g. Acme MSP"
                autoFocus
                required
                style={fieldStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Select...</option>
                  <option value="ISP">ISP</option>
                  <option value="MSP">MSP</option>
                  <option value="IT Services">IT Services</option>
                  <option value="WISP">WISP</option>
                  <option value="Enterprise IT">Enterprise IT</option>
                </select>
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
                <option value="outreach_sent">Outreach Sent</option>
                <option value="responded">Responded</option>
                <option value="discovery_call">Discovery Call</option>
                <option value="technical_review">Technical Review</option>
                <option value="contract_sent">Contract Sent</option>
                <option value="onboarding">Onboarding</option>
                <option value="live">Live</option>
                <option value="dead">Dead</option>
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
