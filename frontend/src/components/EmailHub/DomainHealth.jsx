export default function DomainHealth({ domains, error }) {
  const getHealthColor = (health) => {
    if (health >= 80) return 'var(--color-success)';
    if (health >= 50) return 'var(--color-warning)';
    if (health > 0) return 'var(--color-error)';
    return 'var(--text-tertiary)';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return 'badge-meeting_booked';
      case 'warming': return 'badge-interested';
      case 'paused': return 'badge-contacted';
      case 'banned': return 'badge-dead';
      case 'error': return 'badge-dead';
      case 'pending': return 'badge-new';
      default: return 'badge-new';
    }
  };

  return (
    <div style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ marginBottom: 'var(--space-lg)' }}>Domain & Account Health</h3>
      <div className="card">
        {error === 'no_api_key' ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-lg)' }}>
            No Instantly.ai API key configured. Add it in Settings to see account health.
          </p>
        ) : error ? (
          <div style={{ padding: 'var(--space-lg)' }}>
            <p style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: 'var(--space-sm)' }}>
              Failed to load account data from Instantly.ai
            </p>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{error}</p>
          </div>
        ) : !domains || domains.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-lg)' }}>
            No email accounts found in Instantly.ai.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Health</th>
                <th>Days Warming</th>
                <th>Daily Limit</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, fontSize: '13px' }}>{d.email || d.domain}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{d.domain}</td>
                  <td>
                    <span className={`badge ${getStatusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <div style={{
                        width: '60px', height: '6px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${d.health}%`,
                          height: '100%',
                          background: getHealthColor(d.health),
                          borderRadius: 'var(--radius-full)'
                        }} />
                      </div>
                      <span style={{ fontSize: '13px', color: getHealthColor(d.health), fontWeight: 500 }}>
                        {d.health}%
                      </span>
                    </div>
                  </td>
                  <td>{d.days_warming > 0 ? `${d.days_warming} days` : '-'}</td>
                  <td>{d.daily_limit > 0 ? `${d.daily_limit}/day` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
