import { useState } from 'react'
import ApprovalControls from './ApprovalControls'

const STATUS_COLORS = {
  queued: 'badge-contacted',
  approved: 'badge-meeting_booked',
  rejected: 'badge-dead',
  fired: 'badge-interested',
  completed: 'badge-closed',
  failed: 'badge-dead',
};

export default function QueueList({ items, summary, onApprove, onReject, onBatchApprove, onRefresh }) {
  const [selected, setSelected] = useState(new Set());
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filteredItems = items.filter(item => {
    if (filterType && item.action_type !== filterType) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    return true;
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleBatchApprove = () => {
    const queuedIds = [...selected].filter(id => {
      const item = items.find(i => i.id === id);
      return item && item.status === 'queued';
    });
    if (queuedIds.length > 0) {
      onBatchApprove(queuedIds);
      setSelected(new Set());
    }
  };

  const handleApproveAll = () => {
    const allQueuedIds = filteredItems
      .filter(i => i.status === 'queued')
      .map(i => i.id);
    if (allQueuedIds.length > 0) {
      onBatchApprove(allQueuedIds);
    }
  };

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-info)' }}>{summary.calls_queued || 0}</div>
          <div className="stat-label">Calls Queued</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{summary.emails_queued || 0}</div>
          <div className="stat-label">Emails Queued</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{summary.approved || 0}</div>
          <div className="stat-label">Approved</div>
        </div>
      </div>

      {/* Controls */}
      <ApprovalControls
        selectedCount={selected.size}
        onApproveSelected={handleBatchApprove}
        onApproveAll={handleApproveAll}
        filterType={filterType}
        onFilterType={setFilterType}
        filterStatus={filterStatus}
        onFilterStatus={setFilterStatus}
      />

      {/* Queue List */}
      <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" checked={selected.size === filteredItems.length && filteredItems.length > 0} onChange={toggleAll} />
              </th>
              <th>Lead</th>
              <th>Category</th>
              <th>Type</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-3xl)' }}>
                  No outreach items in queue
                </td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.business_name || `Lead #${item.lead_id}`}</td>
                  <td>{item.category || '-'}</td>
                  <td>
                    <span style={{ color: item.action_type === 'call' ? 'var(--color-info)' : 'var(--color-warning)' }}>
                      {item.action_type === 'call' ? 'Phone Call' : 'Email'}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {item.scheduled_time || 'ASAP'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[item.status] || ''}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {item.status === 'queued' && (
                      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => onApprove(item.id)}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => onReject(item.id)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
