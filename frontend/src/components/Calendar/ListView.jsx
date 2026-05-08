import EventCard from './EventCard'

function groupByDate(events) {
  const groups = {};
  for (const ev of events) {
    if (!groups[ev.event_date]) {
      groups[ev.event_date] = [];
    }
    groups[ev.event_date].push(ev);
  }
  return groups;
}

export default function ListView({ events, onEventClick }) {
  const grouped = groupByDate(events);
  const sortedDates = Object.keys(grouped).sort();
  const today = new Date().toISOString().split('T')[0];

  if (sortedDates.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: 'var(--space-3xl)',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: 'var(--space-lg)' }}>No upcoming events</div>
        <div>Create events manually or let AI auto-populate from call analysis.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {sortedDates.map(date => {
        const dateObj = new Date(date + 'T00:00:00');
        const isToday = date === today;
        const label = dateObj.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        });

        return (
          <div key={date} style={{ marginBottom: 'var(--space-xl)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              marginBottom: 'var(--space-sm)',
              paddingBottom: 'var(--space-sm)',
              borderBottom: '1px solid var(--border-default)',
            }}>
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
              }}>
                {label}
              </span>
              {isToday && (
                <span style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                  fontWeight: 500,
                }}>
                  Today
                </span>
              )}
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                {grouped[date].length} event{grouped[date].length !== 1 ? 's' : ''}
              </span>
            </div>
            {grouped[date]
              .sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''))
              .map(ev => (
                <EventCard key={ev.id} event={ev} onClick={onEventClick} />
              ))}
          </div>
        );
      })}
    </div>
  );
}