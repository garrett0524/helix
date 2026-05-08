import { EVENT_COLORS, EVENT_ICONS } from './EventCard'

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 0=Sun

  const days = [];

  // Previous month fill
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    days.push({ date: d, currentMonth: false });
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), currentMonth: true });
  }

  // Next month fill to complete 6 rows (42 cells) or 5 rows (35 cells)
  const totalRows = days.length > 35 ? 42 : 35;
  let nextDay = 1;
  while (days.length < totalRows) {
    days.push({ date: new Date(year, month + 1, nextDay++), currentMonth: false });
  }

  return days;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

const MAX_VISIBLE_EVENTS = 3;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function MonthView({ events, currentDate, onEventClick, onDayClick, isMobile }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = getMonthGrid(year, month);
  const today = formatDateKey(new Date());

  // Group events by date
  const eventsByDate = {};
  for (const ev of events) {
    if (!eventsByDate[ev.event_date]) {
      eventsByDate[ev.event_date] = [];
    }
    eventsByDate[ev.event_date].push(ev);
  }

  const rows = [];
  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }

  return (
    <div style={{ overflow: 'auto' }}>
      {/* Day name headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--bg-input)',
      }}>
        {(isMobile ? DAY_NAMES_SHORT : DAY_NAMES).map((name, idx) => (
          <div key={idx} style={{
            textAlign: 'center',
            padding: isMobile ? '6px 2px' : '10px 8px',
            fontSize: isMobile ? '11px' : '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid rows */}
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          minHeight: isMobile ? '48px' : '120px',
        }}>
          {row.map((dayObj, colIdx) => {
            const dateKey = formatDateKey(dayObj.date);
            const isToday = dateKey === today;
            const dayEvents = eventsByDate[dateKey] || [];
            const visibleEvents = dayEvents.slice(0, isMobile ? 0 : MAX_VISIBLE_EVENTS);
            const extraCount = dayEvents.length - (isMobile ? 0 : MAX_VISIBLE_EVENTS);

            return (
              <div
                key={colIdx}
                onClick={() => onDayClick && onDayClick(dayObj.date)}
                style={{
                  borderRight: colIdx < 6 ? '1px solid var(--bg-input)' : 'none',
                  borderBottom: '1px solid var(--bg-input)',
                  padding: isMobile ? '4px 2px' : '6px',
                  cursor: 'pointer',
                  background: isToday
                    ? 'rgba(99, 102, 241, 0.06)'
                    : !dayObj.currentMonth
                      ? 'rgba(0, 0, 0, 0.15)'
                      : 'transparent',
                  opacity: dayObj.currentMonth ? 1 : 0.4,
                  transition: 'background 0.15s ease',
                  minHeight: isMobile ? '48px' : '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMobile ? 'center' : 'stretch',
                }}
                onMouseEnter={(e) => {
                  if (!isMobile && dayObj.currentMonth) {
                    e.currentTarget.style.background = isToday
                      ? 'rgba(99, 102, 241, 0.1)'
                      : 'rgba(255, 255, 255, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.background = isToday
                      ? 'rgba(99, 102, 241, 0.06)'
                      : !dayObj.currentMonth
                        ? 'rgba(0, 0, 0, 0.15)'
                        : 'transparent';
                  }
                }}
              >
                {/* Date number */}
                <div style={{
                  display: 'flex',
                  justifyContent: isMobile ? 'center' : 'flex-end',
                  marginBottom: isMobile ? '2px' : '4px',
                }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: isMobile ? '24px' : '28px',
                    height: isMobile ? '24px' : '28px',
                    borderRadius: '50%',
                    fontSize: isMobile ? '11px' : '13px',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#fff' : 'var(--text-primary)',
                    background: isToday ? 'var(--accent-primary)' : 'transparent',
                  }}>
                    {dayObj.date.getDate()}
                  </span>
                </div>

                {/* Mobile: colored dots for events */}
                {isMobile && dayEvents.length > 0 && (
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '100%' }}>
                    {dayEvents.slice(0, 4).map(ev => {
                      const color = EVENT_COLORS[ev.event_type] || '#8b5cf6';
                      return (
                        <div
                          key={ev.id}
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <span style={{ fontSize: '8px', color: 'var(--text-tertiary)', lineHeight: '6px' }}>+</span>
                    )}
                  </div>
                )}

                {/* Desktop: Event pills */}
                {!isMobile && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                    {visibleEvents.map(ev => {
                      const color = EVENT_COLORS[ev.event_type] || '#8b5cf6';
                      const icon = EVENT_ICONS[ev.event_type] || '';
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick && onEventClick(ev);
                          }}
                          style={{
                            background: `${color}25`,
                            borderLeft: `3px solid ${color}`,
                            borderRadius: '3px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            lineHeight: '16px',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ marginRight: '3px', fontSize: '10px' }}>{icon}</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {formatTime(ev.event_time)}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                            {ev.business_name || ev.title}
                          </span>
                        </div>
                      );
                    })}
                    {extraCount > 0 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onDayClick && onDayClick(dayObj.date);
                        }}
                        style={{
                          fontSize: '11px',
                          color: 'var(--accent-primary)',
                          fontWeight: 500,
                          padding: '1px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        +{extraCount} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
