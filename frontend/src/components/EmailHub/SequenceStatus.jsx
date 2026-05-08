export default function SequenceStatus({ sequences, error }) {
  if (error === 'no_api_key') {
    return (
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Email Sequences (Campaigns)</h3>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No Instantly.ai API key configured. Add it in Settings to see your campaigns.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Email Sequences (Campaigns)</h3>
        <p style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: 'var(--space-xs)' }}>
          Failed to load campaigns from Instantly.ai
        </p>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{error}</p>
      </div>
    );
  }

  if (!sequences || sequences.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Email Sequences (Campaigns)</h3>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No campaigns found in Instantly.ai. Create a campaign in Instantly to get started.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return 'badge-meeting_booked';
      case 'paused': return 'badge-contacted';
      case 'completed': return 'badge-closed';
      case 'draft': return 'badge-new';
      default: return 'badge-new';
    }
  };

  return (
    <div style={{ marginBottom: 'var(--space-xl)' }}>
      <h3 style={{ marginBottom: 'var(--space-lg)' }}>Email Sequences (Campaigns)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)' }}>
        {sequences.map((seq, i) => (
          <div key={seq.id || i} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: '15px' }}>{seq.name}</h3>
              <span className={`badge ${getStatusBadge(seq.status)}`}>
                {seq.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-sm)', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Total Leads: </span>
                <span style={{ fontWeight: 500 }}>{seq.total_leads.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Steps: </span>
                <span style={{ fontWeight: 500 }}>{seq.steps}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Sent: </span>
                <span style={{ fontWeight: 500, color: 'var(--color-info)' }}>{seq.emails_sent.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Opened: </span>
                <span style={{ fontWeight: 500, color: 'var(--color-success)' }}>{seq.emails_opened.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Replied: </span>
                <span style={{ fontWeight: 500, color: 'var(--color-warning)' }}>{seq.emails_replied.toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>Bounced: </span>
                <span style={{ fontWeight: 500, color: 'var(--color-error)' }}>{seq.emails_bounced.toLocaleString()}</span>
              </div>
            </div>
            {/* Open/reply rate mini-bar */}
            {seq.emails_sent > 0 && (
              <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-lg)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    Open rate: <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      {((seq.emails_opened / seq.emails_sent) * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    Reply rate: <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                      {((seq.emails_replied / seq.emails_sent) * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
