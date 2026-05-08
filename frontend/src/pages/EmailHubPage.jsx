import { useState, useEffect, useCallback } from 'react'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
};
import SequenceStatus from '../components/EmailHub/SequenceStatus'
import DomainHealth from '../components/EmailHub/DomainHealth'
import LeadDetailModal from '../components/Shared/LeadDetailModal'
import { getEmails, getLeads, updateLead, syncInstantlyStatuses } from '../api'

export default function EmailHubPage() {
  const isMobile = useIsMobile();
  const [emails, setEmails] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [domains, setDomains] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [leadsMap, setLeadsMap] = useState({});
  const [selectedLead, setSelectedLead] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await getEmails();
      setEmails(res.data || []);
      setSequences(res.sequences || []);
      setDomains(res.domains || []);
      setErrors(res.errors || {});
    } catch (err) {
      console.error('Failed to load emails:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Load leads for linking
    getLeads().then(res => {
      const map = {};
      for (const l of (res.data || [])) { map[l.id] = l; }
      setLeadsMap(map);
    }).catch(() => {});
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncInstantlyStatuses();
      setSyncMsg({ type: 'success', text: `Synced: ${res.synced || 0} leads, ${res.updated || 0} updated` });
      fetchData(true);
    } catch (err) {
      setSyncMsg({ type: 'error', text: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleLeadSave = async (id, data) => {
    await updateLead(id, data);
    setSelectedLead(null);
    // Refresh leads map
    const res = await getLeads();
    const map = {};
    for (const l of (res.data || [])) { map[l.id] = l; }
    setLeadsMap(map);
  };

  const filteredEmails = filterStatus
    ? emails.filter(e => e.status === filterStatus)
    : emails;

  if (loading) {
    return <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading email hub...</div>;
  }

  const hasApiKey = errors.sequences !== 'no_api_key' && errors.domains !== 'no_api_key';

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div>
          <h1>Email Hub</h1>
          <p>Instantly.ai email campaigns, account health, and email timeline</p>
        </div>
        {hasApiKey && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 'var(--space-sm)' }}>
            <button
              className="btn btn-secondary"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Statuses'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => fetchData(true)}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}
      </div>

      {syncMsg && (
        <div style={{
          padding: 'var(--space-md)',
          marginBottom: 'var(--space-lg)',
          borderRadius: 'var(--radius-md)',
          background: syncMsg.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${syncMsg.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          fontSize: '13px',
          color: syncMsg.type === 'success' ? '#10b981' : '#ef4444',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{syncMsg.text}</span>
          <button onClick={() => setSyncMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}>&#10005;</button>
        </div>
      )}

      {/* Per-lead email status breakdown */}
      {(() => {
        const leadsList = Object.values(leadsMap);
        const sent = leadsList.filter(l => l.email_status === 'sent').length;
        const opened = leadsList.filter(l => l.email_status === 'opened').length;
        const replied = leadsList.filter(l => l.email_status === 'replied').length;
        const bounced = leadsList.filter(l => l.email_status === 'bounced').length;
        if (sent + opened + replied + bounced === 0) return null;
        return (
          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
            {[
              { label: 'Sent', count: sent, color: '#3b82f6' },
              { label: 'Opened', count: opened, color: '#eab308' },
              { label: 'Replied', count: replied, color: '#10b981' },
              { label: 'Bounced', count: bounced, color: '#ef4444' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 'var(--space-md) var(--space-lg)', minWidth: '100px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <SequenceStatus sequences={sequences} error={errors.sequences} />
      <DomainHealth domains={domains} error={errors.domains} />

      {/* Email Timeline */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h3>Email Log</h3>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: '150px' }}>
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="opened">Opened</option>
            <option value="replied">Replied</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>

        <div className="card">
          {filteredEmails.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-3xl)' }}>
              No emails sent yet. Configure Instantly.ai in Settings and approve outreach to start sending.
            </p>
          ) : isMobile ? (
            /* Mobile: Card view for emails */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', padding: 'var(--space-sm)' }}>
              {filteredEmails.map(email => (
                <div key={email.id} style={{
                  background: 'var(--bg-card-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-md)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{email.business_name || `Lead #${email.lead_id}`}</span>
                    <span className={`badge ${
                      email.status === 'replied' ? 'badge-meeting_booked' :
                      email.status === 'opened' ? 'badge-interested' :
                      email.status === 'bounced' ? 'badge-dead' :
                      'badge-contacted'
                    }`}>
                      {email.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                    {email.sequence_name && <span>{email.sequence_name}</span>}
                    <span>Sent: {email.sent_at?.split('T')[0] || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Sequence</th>
                  <th>Step</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Opened</th>
                  <th>Replied</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmails.map(email => (
                  <tr key={email.id}>
                    <td style={{ fontWeight: 500 }}>
                      <button
                        onClick={() => leadsMap[email.lead_id] && setSelectedLead(leadsMap[email.lead_id])}
                        style={{
                          background: 'none', border: 'none', color: 'var(--accent-primary)',
                          cursor: leadsMap[email.lead_id] ? 'pointer' : 'default',
                          padding: 0, fontWeight: 500, fontSize: 'inherit',
                          textDecoration: leadsMap[email.lead_id] ? 'underline' : 'none',
                        }}
                      >
                        {email.business_name || leadsMap[email.lead_id]?.business_name || `Lead #${email.lead_id}`}
                      </button>
                    </td>
                    <td>{email.sequence_name || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{email.step_number || '-'}</td>
                    <td>
                      <span className={`badge ${
                        email.status === 'replied' ? 'badge-meeting_booked' :
                        email.status === 'opened' ? 'badge-interested' :
                        email.status === 'bounced' ? 'badge-dead' :
                        'badge-contacted'
                      }`}>
                        {email.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{email.sent_at?.split('T')[0] || '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{email.opened_at?.split('T')[0] || '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{email.replied_at?.split('T')[0] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
