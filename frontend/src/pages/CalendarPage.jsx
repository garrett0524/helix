import { useState, useEffect, useCallback } from 'react'
import MonthView from '../components/Calendar/MonthView'
import WeekView from '../components/Calendar/WeekView'
import DayView from '../components/Calendar/DayView'
import ListView from '../components/Calendar/ListView'
import CreateEventModal from '../components/Calendar/CreateEventModal'
import EventDetailModal from '../components/Calendar/EventDetailModal'
import { getCalendarEvents } from '../api'

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split('T')[0],
    to: sunday.toISOString().split('T')[0],
  };
}

function getMonthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  // Get the first day of the month's grid (may include prev month days)
  const firstOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstOfMonth.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startDayOfWeek);
  // Get last day of month to determine grid end
  const lastOfMonth = new Date(year, month + 1, 0);
  const totalDays = startDayOfWeek + lastOfMonth.getDate();
  const totalCells = totalDays > 35 ? 42 : 35;
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + totalCells - 1);
  return {
    from: gridStart.toISOString().split('T')[0],
    to: gridEnd.toISOString().split('T')[0],
  };
}

function getListRange(date) {
  const from = date.toISOString().split('T')[0];
  const to = new Date(date);
  to.setDate(to.getDate() + 14);
  return { from, to: to.toISOString().split('T')[0] };
}

export default function CalendarPage() {
  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // If on week view and switching to mobile, go to month
      if (mobile && view === 'week') {
        setView('month');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view]);

  const fetchEvents = useCallback(async () => {
    try {
      let range;
      if (view === 'month') {
        range = getMonthRange(currentDate);
      } else if (view === 'week') {
        range = getWeekRange(currentDate);
      } else if (view === 'day') {
        const dateStr = currentDate.toISOString().split('T')[0];
        range = { from: dateStr, to: dateStr };
      } else {
        range = getListRange(currentDate);
      }

      const result = await getCalendarEvents({ date_from: range.from, date_to: range.to });
      setEvents(result.data || []);
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    } finally {
      setLoading(false);
    }
  }, [view, currentDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else if (view === 'day') d.setDate(d.getDate() - 1);
    else d.setDate(d.getDate() - 14);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else if (view === 'day') d.setDate(d.getDate() + 1);
    else d.setDate(d.getDate() + 14);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
  };

  const handleDayClick = (date) => {
    setCurrentDate(date);
    setView('day');
  };

  const getHeaderLabel = () => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (view === 'week') {
      const range = getWeekRange(currentDate);
      const mon = new Date(range.from + 'T00:00:00');
      const sun = new Date(range.to + 'T00:00:00');
      const monLabel = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sunLabel = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${monLabel} - ${sunLabel}`;
    }
    return 'Upcoming 14 Days';
  };

  const btnStyle = (active) => ({
    background: active ? 'var(--gradient-primary)' : 'transparent',
    color: active ? 'white' : 'var(--text-tertiary)',
    border: active ? 'none' : '1px solid transparent',
    borderRadius: 'var(--radius-md)',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s ease',
  });

  const navBtnStyle = {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s ease',
  };

  return (
    <div>
      <div className="page-header">
        <h1>Calendar</h1>
        <p>Manage your schedule and follow-ups</p>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-lg)',
        flexWrap: 'wrap',
        gap: 'var(--space-sm)',
      }}>
        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <button style={{ ...navBtnStyle, minHeight: '44px' }} onClick={handlePrev}>&lt;</button>
          <button style={{ ...navBtnStyle, minHeight: '44px' }} onClick={handleToday}>Today</button>
          <button style={{ ...navBtnStyle, minHeight: '44px' }} onClick={handleNext}>&gt;</button>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: isMobile ? '14px' : '16px', marginLeft: 'var(--space-sm)', letterSpacing: '-0.2px' }}>
            {getHeaderLabel()}
          </span>
        </div>

        {/* View toggle + Add button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-card-elevated)', borderRadius: 'var(--radius-md)', padding: '2px', border: '1px solid var(--border-default)' }}>
            <button style={btnStyle(view === 'month')} onClick={() => setView('month')}>Month</button>
            {!isMobile && <button style={btnStyle(view === 'week')} onClick={() => setView('week')}>Week</button>}
            <button style={btnStyle(view === 'day')} onClick={() => setView('day')}>Day</button>
            <button style={btnStyle(view === 'list')} onClick={() => setView('list')}>List</button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Add Event
          </button>
        </div>
      </div>

      {/* Calendar body */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
      }}>
        {loading ? (
          <div style={{ padding: 'var(--space-3xl)', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading calendar...
          </div>
        ) : (
          <>
            {view === 'month' && (
              <MonthView events={events} currentDate={currentDate} onEventClick={handleEventClick} onDayClick={handleDayClick} isMobile={isMobile} />
            )}
            {view === 'week' && (
              <WeekView events={events} currentDate={currentDate} onEventClick={handleEventClick} />
            )}
            {view === 'day' && (
              <DayView events={events} currentDate={currentDate} onEventClick={handleEventClick} />
            )}
            {view === 'list' && (
              <ListView events={events} onEventClick={handleEventClick} />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchEvents}
          prefillDate={currentDate.toISOString().split('T')[0]}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdated={fetchEvents}
        />
      )}
    </div>
  );
}