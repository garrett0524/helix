import EventCard from './EventCard'

const HOURS = [];
for (let h = 8; h <= 20; h++) {
  HOURS.push(h);
}

function getWeekDays(baseDate) {
  const date = new Date(baseDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

function timeToHour(timeStr) {
  if (!timeStr) return 8;
  const [h] = timeStr.split(':').map(Number);
  return h;
}

export default function WeekView({ events, currentDate, onEventClick }) {
  const weekDays = getWeekDays(currentDate);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Group events by date
  const eventsByDate = {};
  for (const ev of events) {
    if (!eventsByDate[ev.event_date]) {
      eventsByDate[ev.event_date] = [];
    }
    eventsByDate[ev.event_date].push(ev);
  }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div style={{ overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: '800px' }}>
        {/* Header row */}
        <div style={{ borderBottom: '1px solid var(--border-default)', padding: '8px' }} />
        {weekDays.map((day, i) => {
          const dateKey = formatDateKey(day);
          const isToday = dateKey === today;
          return (
            <div key={i} style={{
              textAlign: 'center',
              padding: '8px',
              borderBottom: '1px solid var(--border-default)',
              borderLeft: '1px solid var(--border-default)',
              background: isToday ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                {dayNames[i]}
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: 600,
                color: isToday ? 'var(--accent-primary)' : 'var(--text-primary)',
              }}>
                {day.getDate()}
              </div>
            </div>
          );
        })}

        {/* Time slots */}
        {HOURS.map(hour => (
          <div key={hour} style={{ display: 'contents' }}>
            {/* Time label */}
            <div style={{
              padding: '4px 8px',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              textAlign: 'right',
              borderBottom: '1px solid var(--border-default)',
              height: '60px',
              position: 'relative',
            }}>
              {hour === 0 ? '12 AM' : hour <= 12 ? `${hour} ${hour < 12 ? 'AM' : 'PM'}` : `${hour - 12} PM`}
            </div>

            {/* Day cells */}
            {weekDays.map((day, dayIdx) => {
              const dateKey = formatDateKey(day);
              const isToday = dateKey === today;
              const cellEvents = (eventsByDate[dateKey] || []).filter(ev => timeToHour(ev.event_time) === hour);

              // Current time indicator
              const showTimeIndicator = isToday && currentHour === hour;

              return (
                <div key={dayIdx} style={{
                  borderLeft: '1px solid var(--border-default)',
                  borderBottom: '1px solid var(--border-default)',
                  padding: '2px',
                  height: '60px',
                  background: isToday ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
                  position: 'relative',
                  overflow: 'hidden',
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
                  {cellEvents.map(ev => (
                    <EventCard key={ev.id} event={ev} compact onClick={onEventClick} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}