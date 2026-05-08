import { useState, useMemo, useEffect } from 'react'
import { enrichLead } from '../../api'
import './LeadTable.css'

// MSP pipeline stages (Phase 5)
const STAGE_LABELS = {
  new: 'New',
  outreach_sent: 'Outreach Sent',
  responded: 'Responded',
  discovery_call: 'Discovery Call',
  technical_review: 'Technical Review',
  contract_sent: 'Contract Sent',
  onboarding: 'Onboarding',
  live: 'Live',
  dead: 'Dead',
};

// Fixed MSP category dropdown options (Phase 5)
const MSP_CATEGORIES = ['ISP', 'MSP', 'IT Services', 'WISP', 'Enterprise IT'];

const EMAIL_STATUS_LABEL = {
  none: 'No Email',
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  bounced: 'Bounced',
};

function formatLocation(lead) {
  const city = lead.city ? String(lead.city).trim() : '';
  const state = lead.state ? String(lead.state).trim() : '';
  if (city && state) return `${city}, ${state}`;
  return city || state || '-';
}

function formatContact(lead) {
  if (lead.contact_name && lead.contact_title) return `${lead.contact_name} (${lead.contact_title})`;
  return lead.contact_name || lead.owner_name || '-';
}

export default function LeadTable({
  leads,
  onRowClick,
  onSort,
  sortField,
  sortDir,
  onLeadEnriched,
  selectedIds = new Set(),
  onSelectionChange,
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [search, setSearch] = useState('');
  const [enrichingId, setEnrichingId] = useState(null);
  const [filters, setFilters] = useState({
    category: '',
    stage: '',
    scoreMin: '',
    scoreMax: '',
    emailStatus: '',
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (search) {
        const term = search.toLowerCase();
        const match = (lead.business_name || '').toLowerCase().includes(term)
          || (lead.address || '').toLowerCase().includes(term)
          || (lead.contact_name || '').toLowerCase().includes(term)
          || (lead.owner_name || '').toLowerCase().includes(term)
          || (lead.email || '').toLowerCase().includes(term)
          || (lead.city || '').toLowerCase().includes(term);
        if (!match) return false;
      }
      if (filters.category && lead.category !== filters.category) return false;
      if (filters.stage && lead.pipeline_stage !== filters.stage) return false;
      if (filters.scoreMin && lead.lead_score < Number(filters.scoreMin)) return false;
      if (filters.scoreMax && lead.lead_score > Number(filters.scoreMax)) return false;
      if (filters.emailStatus) {
        const status = lead.email_status || 'none';
        if (filters.emailStatus === 'no_email' && lead.email) return false;
        else if (filters.emailStatus === 'has_email' && !lead.email) return false;
        else if (!['no_email', 'has_email'].includes(filters.emailStatus) && status !== filters.emailStatus) return false;
      }
      return true;
    });
  }, [leads, search, filters]);

  const handleSort = (field) => {
    if (onSort) onSort(field);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="sort-icon">{'⇳'}</span>;
    return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Selection helpers — only operate when a parent passed onSelectionChange.
  const selectionEnabled = typeof onSelectionChange === 'function';
  const allFilteredSelected = selectionEnabled
    && filteredLeads.length > 0
    && filteredLeads.every(l => selectedIds.has(l.id));

  const toggleOne = (id, e) => {
    if (!selectionEnabled) return;
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  const toggleAllFiltered = (e) => {
    if (!selectionEnabled) return;
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      filteredLeads.forEach(l => next.delete(l.id));
    } else {
      filteredLeads.forEach(l => next.add(l.id));
    }
    onSelectionChange(next);
  };

  return (
    <div className="lead-table-container">
      {/* Filter bar */}
      <div className="lead-table-filters">
        <input
          type="search"
          placeholder="Search MSPs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="lead-search"
        />
        <select value={filters.category} onChange={e => setFilters(f => ({...f, category: e.target.value}))}>
          <option value="">All Categories</option>
          {MSP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.stage} onChange={e => setFilters(f => ({...f, stage: e.target.value}))}>
          <option value="">All Stages</option>
          {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.emailStatus} onChange={e => setFilters(f => ({...f, emailStatus: e.target.value}))}>
          <option value="">Email Status</option>
          <option value="no_email">No Email</option>
          <option value="has_email">Has Email</option>
          <option value="sent">Sent</option>
          <option value="opened">Opened</option>
          <option value="replied">Replied</option>
          <option value="bounced">Bounced</option>
        </select>
        <input
          type="number"
          placeholder="Score min"
          value={filters.scoreMin}
          onChange={e => setFilters(f => ({...f, scoreMin: e.target.value}))}
          style={{ width: '100px' }}
        />
        <input
          type="number"
          placeholder="Score max"
          value={filters.scoreMax}
          onChange={e => setFilters(f => ({...f, scoreMax: e.target.value}))}
          style={{ width: '100px' }}
        />
        {selectionEnabled && selectedIds.size > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {selectedIds.size} selected
          </span>
        )}
      </div>

      {/* Mobile Card View */}
      {isMobile ? (
        <div className="lead-card-list" style={{ padding: 'var(--space-sm)' }}>
          {filteredLeads.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-3xl)' }}>
              {leads.length === 0 ? 'No leads yet — run a scrape or import CSV' : 'No leads match filters'}
            </div>
          ) : (
            filteredLeads.map(lead => (
              <div
                key={lead.id}
                onClick={() => onRowClick(lead)}
                style={{
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-md)',
                  marginBottom: 'var(--space-sm)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  minHeight: '44px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xs)' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.business_name}
                  </div>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '14px',
                    marginLeft: 'var(--space-sm)',
                    flexShrink: 0,
                    color: lead.lead_score >= 70 ? 'var(--color-success)' :
                           lead.lead_score >= 40 ? 'var(--color-warning)' : 'var(--text-secondary)'
                  }}>
                    {lead.lead_score || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {lead.category && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {lead.category}
                    </span>
                  )}
                  <span className={`badge badge-${lead.pipeline_stage}`}>
                    {STAGE_LABELS[lead.pipeline_stage] || lead.pipeline_stage}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Desktop Table — MSP columns */
        <div className="lead-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {selectionEnabled && (
                  <th style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      onClick={e => e.stopPropagation()}
                      aria-label="Select all visible leads"
                    />
                  </th>
                )}
                <th onClick={() => handleSort('business_name')}>Name <SortIcon field="business_name" /></th>
                <th onClick={() => handleSort('category')}>Category <SortIcon field="category" /></th>
                <th>Location</th>
                <th>Contact</th>
                <th>Email</th>
                <th onClick={() => handleSort('estimated_locations')}>Locations Managed <SortIcon field="estimated_locations" /></th>
                <th>Hardware</th>
                <th>Stage</th>
                <th onClick={() => handleSort('lead_score')}>Score <SortIcon field="lead_score" /></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={selectionEnabled ? 11 : 10} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-3xl)' }}>
                    {leads.length === 0 ? 'No leads yet — run a scrape or import CSV' : 'No leads match filters'}
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => {
                  const emailStatus = lead.email_status || 'none';
                  const isSelected = selectedIds.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onRowClick(lead)}
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(139,92,246,0.06)' : undefined,
                      }}
                    >
                      {selectionEnabled && (
                        <td onClick={e => e.stopPropagation()} style={{ width: '36px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleOne(lead.id, e)}
                            aria-label={`Select ${lead.business_name}`}
                          />
                        </td>
                      )}
                      <td style={{ fontWeight: 500 }}>{lead.business_name}</td>
                      <td>{lead.category || '-'}</td>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatLocation(lead)}
                      </td>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {formatContact(lead)}
                      </td>
                      <td style={{ maxWidth: '220px' }}>
                        {lead.email ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                              {lead.email}
                            </span>
                            <span
                              className={`badge badge-email-${emailStatus}`}
                              style={{ flexShrink: 0 }}
                            >
                              {EMAIL_STATUS_LABEL[emailStatus] || emailStatus}
                            </span>
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnrichingId(lead.id);
                              enrichLead(lead.id).then(() => {
                                if (onLeadEnriched) onLeadEnriched();
                              }).catch(() => {}).finally(() => setEnrichingId(null));
                            }}
                            disabled={enrichingId === lead.id}
                            style={{
                              background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer',
                              fontSize: '12px', padding: 0, textDecoration: 'underline',
                            }}
                          >
                            {enrichingId === lead.id ? 'Enriching...' : 'Enrich'}
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {lead.estimated_locations != null ? lead.estimated_locations : '-'}
                      </td>
                      <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {lead.hardware_vendors || '-'}
                      </td>
                      <td>
                        <span className={`badge badge-${lead.pipeline_stage}`}>
                          {STAGE_LABELS[lead.pipeline_stage] || lead.pipeline_stage}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 600,
                          color: lead.lead_score >= 70 ? 'var(--color-success)' :
                                 lead.lead_score >= 40 ? 'var(--color-warning)' : 'var(--text-secondary)'
                        }}>
                          {lead.lead_score || 0}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="lead-table-footer">
        Showing {filteredLeads.length} of {leads.length} leads
      </div>
    </div>
  );
}
