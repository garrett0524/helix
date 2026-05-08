export default function ApprovalControls({
  selectedCount,
  onApproveSelected,
  onApproveAll,
  filterType,
  onFilterType,
  filterStatus,
  onFilterStatus
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-md)',
      flexWrap: 'wrap',
      padding: 'var(--space-md) var(--space-lg)',
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-default)'
    }}>
      <button className="btn btn-primary" onClick={onApproveAll}>
        Approve All
      </button>
      <button
        className="btn btn-secondary"
        onClick={onApproveSelected}
        disabled={selectedCount === 0}
      >
        Approve Selected ({selectedCount})
      </button>

      <div style={{ flex: 1 }} />

      <select value={filterType} onChange={e => onFilterType(e.target.value)} style={{ width: '140px' }}>
        <option value="">All Types</option>
        <option value="call">Calls</option>
        <option value="email">Emails</option>
      </select>

      <select value={filterStatus} onChange={e => onFilterStatus(e.target.value)} style={{ width: '140px' }}>
        <option value="">All Status</option>
        <option value="queued">Queued</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>
    </div>
  );
}
