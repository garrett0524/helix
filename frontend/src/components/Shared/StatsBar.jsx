import { useState, useEffect } from 'react'
import { getStatsOverview } from '../../api'

export default function StatsBar() {
  const [stats, setStats] = useState({
    total_leads: 0,
    contacted_today: 0,
    meetings_this_week: 0,
    conversion_rate: 0
  });

  useEffect(() => {
    getStatsOverview()
      .then(data => setStats(data))
      .catch(() => {});
  }, []);

  const items = [
    { label: 'Total Leads', value: stats.total_leads, color: 'var(--accent-primary)' },
    { label: 'Contacted Today', value: stats.contacted_today, color: 'var(--color-info)' },
    { label: 'Meetings This Week', value: stats.meetings_this_week, color: 'var(--color-success)' },
    { label: 'Conversion Rate', value: `${stats.conversion_rate.toFixed(1)}%`, color: 'var(--color-warning)' },
  ];

  return (
    <div className="grid grid-4 gap-lg" style={{ marginBottom: 'var(--space-xl)' }}>
      {items.map(item => (
        <div key={item.label} className="stat-card" style={{ borderLeftColor: item.color }}>
          <div className="stat-value">{item.value}</div>
          <div className="stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
