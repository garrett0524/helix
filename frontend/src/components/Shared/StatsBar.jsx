import { useState, useEffect } from 'react'
import { getStatsOverview } from '../../api'

/**
 * MSP overview stats — exactly four tiles.
 *
 * `refreshKey` is an optional prop the parent (PipelinePage) bumps whenever
 * leads change so the bar re-fetches without us having to thread an event bus
 * through the whole tree.
 */
export default function StatsBar({ refreshKey = 0 }) {
  const [stats, setStats] = useState({
    totalMsps: 0,
    contactedThisWeek: 0,
    discoveryCalls: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    let cancelled = false;
    getStatsOverview()
      .then(data => {
        if (cancelled) return;
        setStats({
          totalMsps: data.totalMsps ?? 0,
          contactedThisWeek: data.contactedThisWeek ?? 0,
          discoveryCalls: data.discoveryCalls ?? 0,
          conversionRate: data.conversionRate ?? 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  const items = [
    { label: 'Total MSPs', value: stats.totalMsps, color: 'var(--accent-primary)' },
    { label: 'Contacted This Week', value: stats.contactedThisWeek, color: 'var(--color-info)' },
    { label: 'Discovery Calls', value: stats.discoveryCalls, color: 'var(--color-success)' },
    { label: 'Conversion Rate', value: `${Number(stats.conversionRate || 0).toFixed(0)}%`, color: 'var(--color-warning)' },
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
