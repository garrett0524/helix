import EventCard from './EventCard'

const HOURS = [];
for (let h = 8; h <= 20; h++) {
  HOURS.push(h);
}

function timeToHour(timeStr) {
  if (!timeStr) return 8;
  const [h] = timeStr.split(':').map(Number);
  return h;
}

export default function DayView({ events, currentDate, onEventClick }) {
  const dateKey = currentDate.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  const isToday = dateKey === today;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const dayEvents = events.filter(ev => ev.event_date === dateKey);

  const dayLabel = currentDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div>
      <div style={{
        textAlign: 'center',
        padding: 'var(--space-md)',
        borderBottom: '1px solid var(--border-default)',
        marginBottom: 'var(--space-md)',
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
        }}>
          {dayLabel}
          {isToday && (
            <span style={{
              background: 'var(--accent-primary)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: '11px',
              marginLeft: '8px',
              fontWeight: 500,
            }}>
              Today
            </span>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {HOURS.map(hour => {
          const hourEvents = dayEvents.filter(ev => timeToHour(ev.event_time) === hour);
          const showTimeIndicator = isToday && currentHour === hour;

          return (
            <div key={hour} style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr',
              minHeight: '64px',
              borderBottom: '1px solid var(--border-default)',
              position: 'relative',
            }}>
              {/* Time label */}
              <div style={{
                padding: '8px',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                textAlign: 'right',
                paddingRight: '12px',
                fontWeight: 500,
              }}>
                {hour === 0 ? '12 AM' : hour <= 12 ? `${hour} ${hour < 12 ? 'AM' : 'PM'}` : `${hour - 12} PM`}
              </div>

              {/* Events area */}
              <div style={{
                padding: '4px 8px',
                borderLeft: '1px solid var(--border-default)',
                position: 'relative',
              }}>
                {showTimeIndicator && (
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${(currentMinute / 60) * 100}%`,
                    height: '2px',
                    background: '#ef4444',
                    zIndex: 2,
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: '-4px',
                      top: '-3px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#ef4444',
                    }} />
                  </div>
                )}
                {hourEvents.map(ev => (
                  <EventCard key={ev.id} event={ev} onClick={onEventClick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}