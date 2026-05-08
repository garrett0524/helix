import { useState, useEffect } from 'react'
import { getScraperHistory } from '../../api'

export default function ScraperHistory() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getScraperHistory()
      .then(res => setHistory(res.data || []))
      .catch(() => {});
  }, []);

  return (
    <div className="card">
      <h3 style={{ marginBottom: 'var(--space-lg)' }}>Scrape History</h3>

      {history.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
          No scrape jobs yet. Run a scrape or import CSV to get started.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Geography</th>
              <th>Status</th>
              <th>Found</th>
              <th>Imported</th>
              <th>Skipped</th>
            </tr>
          </thead>
          <tbody>
            {history.map(job => (
              <tr key={job.id}>
                <td style={{ fontSize: '13px' }}>{job.started_at?.split('T')[0] || '-'}</td>
                <td>{job.category}</td>
                <td>{job.geography}</td>
                <td>
                  <span className={`badge ${job.status === 'completed' ? 'badge-meeting_booked' : job.status === 'failed' ? 'badge-dead' : 'badge-contacted'}`}>
                    {job.status}
                  </span>
                </td>
                <td>{job.leads_found || 0}</td>
                <td>{job.leads_imported || 0}</td>
                <td>{job.leads_skipped || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
