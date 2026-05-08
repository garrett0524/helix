import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTodayEvents } from '../../api'

const EVENT_COLORS = {
  callback: '#3b82f6',
  site_visit: '#10b981',
  follow_up_email: '#f59e0b',
  follow_up_call: '#f97316',
  custom: '#8b5cf6',
};

const EVENT_ICONS = {
  callback: '\u260E',
  site_visit: '\u{1F3E2}',
  follow_up_email: '\u2709',
  follow_up_call: '\u{1F4DE}',
  custom: '\u2605',
};

export default function TodayScheduleWidget() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getTodayEvents()
      .then(res => setEvents((res.data || []).slice(0, 5)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      marginBottom: 'var(--space-lg)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-md)',
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Today's Schedule</h3>
        <button
          onClick={() => navigate('/calendar')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-primary)',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          View Calendar &rarr;
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: 'var(--space-sm) 0' }}>
          Loading...
        </div>
      ) : events.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: 'var(--space-sm) 0' }}>
          No events scheduled for today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {events.map(ev => {
            const color = EVENT_COLORS[ev.event_type] || '#8b5cf6';
            const icon = EVENT_ICONS[ev.event_type] || '*';
            return (
              <div
                key={ev.id}
                onClick={() => navigate('/calendar')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${color}`,
                  background: `${color}10`,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = `${color}20`}
                onMouseLeave={(e) => e.currentTarget.style.background = `${color}10`}
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{icon}</span>
                <span style={{
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  minWidth: '45px',
                  flexShrink: 0,
                }}>
                  {ev.event_time}
                </span>
                <span style={{
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {ev.business_name || ev.title}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}