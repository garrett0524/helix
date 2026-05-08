import { useState } from 'react'

const EVENT_COLORS = {
  callback: '#3b82f6',
  site_visit: '#10b981',
  follow_up_email: '#f59e0b',
  follow_up_call: '#f97316',
  custom: '#8b5cf6',
};

const EVENT_LABELS = {
  callback: 'Callback',
  site_visit: 'Site Visit',
  follow_up_email: 'Follow-Up Email',
  follow_up_call: 'Follow-Up Call',
  custom: 'Custom',
};

const EVENT_ICONS = {
  callback: '\u260E',
  site_visit: '\u{1F3E2}',
  follow_up_email: '\u2709',
  follow_up_call: '\u{1F4DE}',
  custom: '\u2605',
};

export default function EventCard({ event, compact, onClick }) {
  const color = EVENT_COLORS[event.event_type] || '#8b5cf6';
  const label = EVENT_LABELS[event.event_type] || 'Event';
  const icon = EVENT_ICONS[event.event_type] || '*';

  if (compact) {
    return (
      <div
        onClick={() => onClick && onClick(event)}
        style={{
          background: `${color}20`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 'var(--radius-sm)',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '12px',
          marginBottom: '2px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ marginRight: '4px' }}>{icon}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          {event.event_time}
        </span>
        <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
          {event.business_name || event.title}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick && onClick(event)}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-md)',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        marginBottom: 'var(--space-sm)',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {event.business_name || event.title}
          </span>
        </div>
        <span style={{
          background: `${color}20`,
          color: color,
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          fontSize: '11px',
          fontWeight: 500,
        }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
        <span>{event.event_time}</span>
        <span>{event.duration_minutes} min</span>
        {event.status !== 'scheduled' && (
          <span style={{
            color: event.status === 'completed' ? 'var(--color-success)' : event.status === 'cancelled' ? 'var(--color-error)' : 'var(--color-warning)',
            fontWeight: 500,
          }}>
            {event.status}
          </span>
        )}
      </div>
      {event.description && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.description}
        </div>
      )}
    </div>
  );
}

export { EVENT_COLORS, EVENT_LABELS, EVENT_ICONS };