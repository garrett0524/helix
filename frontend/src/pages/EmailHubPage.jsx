import { useState, useEffect, useCallback, useMemo } from 'react';
import LeadDetailModal from '../components/Shared/LeadDetailModal';
import {
  getLeads,
  updateLead,
  getApolloSequences,
  syncApolloEmailStatuses,
} from '../api';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};

const STATUS_COLORS = {
  sent: '#3b82f6',
  opened: '#eab308',
  replied: '#10b981',
  bounced: '#ef4444',
};

const STATUS_BADGE_CLASS = {
  sent: 'badge-contacted',
  opened: 'badge-interested',
  replied: 'badge-meeting_booked',
  bounced: 'badge-dead',
};

function formatPercent(numerator, denominator) {
  if (!denominator) return '0%';
  const pct = (numerator / denominator) * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${pct.toFixed(1)}%`;
}

function formatTimestamp(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = sameYear
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

function SequenceCard({ sequence }) {
  const sent = Number(sequence.sent || 0);
  const opened = Number(sequence.opened || 0);
  const replied = Number(sequence.replied || 0);
  const bounced = Number(sequence.bounced || 0);
  const openRate = formatPercent(opened, sent);
  const replyRate = formatPercent(replied, sent);

  const tile = (label, value, color) => (
    <div
      key={label}
      style={{
        flex: '1 1 0',
        minWidth: '64px',
        background: 'var(--bg-card-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-sm) var(--space-md)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );

  const bar = (label, pct, color) => {
    const widthPct = sent > 0 ? Math.min(100, (label === 'Opened' ? opened : replied) / sent * 100) : 0;
    return (
      <div style={{ marginTop: 'var(--space-sm)' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px',
        }}>
          <span>{label}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct}</span>
        </div>
        <div style={{
          height: '6px', background: 'var(--bg-card-elevated)',
          borderRadius: '3px', overflow: 'hidden',
          border: '1px solid var(--border-default)',
        }}>
          <div style={{
            width: `${widthPct}%`, height: '100%',
            background: color, transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-lg)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-md)',
      }}
    >
      <div>
        <div style={{
          fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--accent-primary)', marginBottom: '4px',
        }}>
          Apollo Sequence
        </div>
        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
          {sequence.name || `Sequence #${sequence.id}`}
        </h3>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        {tile('Sent', sent, STATUS_COLORS.sent)}
        {tile('Opened', opened, STATUS_COLORS.opened)}
        {tile('Replied', replied, STATUS_COLORS.replied)}
        {tile('Bounced', bounced, STATUS_COLORS.bounced)}
      </div>

      <div>
        {bar('Opened', openRate, STATUS_COLORS.opened)}
        {bar('Replied', replyRate, STATUS_COLORS.replied)}
      </div>
    </div>
  );
}

export default function EmailHubPage() {
  const isMobile = useIsMobile();
  const [sequences, setSequences] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sequenceFilter, setSequenceFilter] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [error, setError] = useState(null);

  const sequenceMap = useMemo(() => {
    const map = {};
    for (const s of sequences) {
      if (s && s.id != null) map[String(s.id)] = s;
    }
    return map;
  }, [sequences]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seqRes, leadsRes] = await Promise.all([
        getApolloSequences().catch((err) => ({ __error: err.message })),
        getLeads().catch((err) => ({ __error: err.message })),
      ]);

      if (seqRes && seqRes.__error) {
        setError(seqRes.__error);
        setSequences([]);
      } else {
        // getApolloSequences returns either an array or { data: [...] }
        const arr = Array.isArray(seqRes) ? seqRes : (seqRes?.data || []);
        setSequences(arr);
      }

      if (leadsRes && leadsRes.__error) {
        setLeads([]);
      } else {
        setLeads(leadsRes?.data || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncApolloEmailStatuses();
      const updated = res?.updated ?? 0;
      setToast({ type: 'success', message: `Updated ${updated} lead${updated === 1 ? '' : 's'}` });
      await loadAll();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const handleLeadSave = async (id, data) => {
    await updateLead(id, data);
    setSelectedLead(null);
    await loadAll();
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter) {
        if (statusFilter === 'none') {
          if (lead.email_status) return false;
        } else if (lead.email_status !== statusFilter) {
          return false;
        }
      }
      if (sequenceFilter) {
        if (String(lead.apollo_sequence_id ?? '') !== sequenceFilter) return false;
      }
      // For the activity section, show only leads that have email activity OR a sequence assignment
      if (!statusFilter && !sequenceFilter) {
        return Boolean(lead.email_status || lead.apollo_sequence_id || lead.last_email_at);
      }
      return true;
    });
  }, [leads, statusFilter, sequenceFilter]);

  const renderToolbar = () => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      flexWrap: 'wrap', gap: 'var(--space-sm)',
    }}>
      <div>
        <h1>Email Hub</h1>
        <p>Apollo sequence performance and per-lead activity</p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 'var(--space-sm)' }}>
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Statuses'}
        </button>
        <button className="btn btn-secondary" onClick={loadAll} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );

  const renderSequencesSection = () => {
    if (loading && sequences.length === 0) {
      return (
        <div className="card" style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading Apollo sequences...
        </div>
      );
    }

    if (error) {
      return (
        <div className="card" style={{
          padding: 'var(--space-lg)',
          borderLeft: '3px solid #ef4444',
          color: '#ef4444',
        }}>
          Failed to load Apollo sequences: {error}
        </div>
      );
    }

    if (sequences.length === 0) {
      return (
        <div className="card" style={{
          padding: 'var(--space-2xl)',
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-xs)' }}>
            No Apollo sequences yet
          </div>
          <div style={{ fontSize: '13px' }}>
            Sequences are created in Apollo. They will appear here once contacts have been added.
          </div>
        </div>
      );
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 'var(--space-lg)',
      }}>
        {sequences.map((seq) => (
          <SequenceCard key={seq.id} sequence={seq} />
        ))}
      </div>
    );
  };

  const renderActivityTable = () => {
    if (filteredLeads.length === 0) {
      return (
        <div className="card" style={{
          padding: 'var(--space-2xl)',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
        }}>
          {statusFilter || sequenceFilter
            ? 'No leads match the current filters.'
            : 'No email activity yet. Leads with Apollo sequence assignments or email events will appear here.'}
        </div>
      );
    }

    if (isMobile) {
      return (
        <div className="card" style={{ padding: 'var(--space-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {filteredLeads.map((lead) => {
            const seq = sequenceMap[String(lead.apollo_sequence_id ?? '')];
            const status = lead.email_status || 'none';
            return (
              <button
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                style={{
                  textAlign: 'left',
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-md)',
                  cursor: 'pointer',
                  color: 'inherit',
                  font: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>
                    {lead.contact_name || lead.business_name || `Lead #${lead.id}`}
                  </span>
                  {lead.email_status && (
                    <span className={`badge ${STATUS_BADGE_CLASS[lead.email_status] || 'badge-contacted'}`}>
                      {lead.email_status}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {lead.email && <span>{lead.email}</span>}
                  <span>{seq ? seq.name : (lead.apollo_sequence_id ? `Sequence #${lead.apollo_sequence_id}` : 'No sequence')}</span>
                  <span>Updated: {formatTimestamp(lead.updated_at)}</span>
                </div>
                {!lead.email_status && status === 'none' && null}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Sequence</th>
              <th>Status</th>
              <th>Last Update</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => {
              const seq = sequenceMap[String(lead.apollo_sequence_id ?? '')];
              return (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 500 }}>
                    {lead.contact_name || lead.business_name || `Lead #${lead.id}`}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{lead.email || '-'}</td>
                  <td>{seq ? seq.name : (lead.apollo_sequence_id ? `Sequence #${lead.apollo_sequence_id}` : '-')}</td>
                  <td>
                    {lead.email_status ? (
                      <span className={`badge ${STATUS_BADGE_CLASS[lead.email_status] || 'badge-contacted'}`}>
                        {lead.email_status}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {formatTimestamp(lead.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        {renderToolbar()}
      </div>

      {/* Sequences grid */}
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        {renderSequencesSection()}
      </div>

      {/* Per-Lead Activity */}
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-sm)',
        }}>
          <h3 style={{ margin: 0 }}>Lead Email Activity</h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: '140px' }}
              aria-label="Filter by email status"
            >
              <option value="">All statuses</option>
              <option value="none">No activity</option>
              <option value="sent">Sent</option>
              <option value="opened">Opened</option>
              <option value="replied">Replied</option>
              <option value="bounced">Bounced</option>
            </select>
            <select
              value={sequenceFilter}
              onChange={(e) => setSequenceFilter(e.target.value)}
              style={{ minWidth: '180px' }}
              aria-label="Filter by Apollo sequence"
            >
              <option value="">All sequences</option>
              {sequences.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name || `Sequence #${s.id}`}</option>
              ))}
            </select>
          </div>
        </div>

        {renderActivityTable()}
      </div>

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
            borderLeft: `3px solid ${toast.type === 'error' ? '#ef4444' : 'var(--color-success, #10b981)'}`,
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

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onSave={handleLeadSave}
        />
      )}
    </div>
  );
}
