import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateCalendarEvent, completeCalendarEvent, cancelCalendarEvent } from '../../api'
import { EVENT_COLORS, EVENT_LABELS, EVENT_ICONS } from './EventCard'

export default function EventDetailModal({ event, onClose, onUpdated }) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    title: event.title,
    event_type: event.event_type,
    event_date: event.event_date,
    event_time: event.event_time,
    duration_minutes: event.duration_minutes || 15,
    description: event.description || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const color = EVENT_COLORS[event.event_type] || '#8b5cf6';
  const label = EVENT_LABELS[event.event_type] || 'Event';
  const icon = EVENT_ICONS[event.event_type] || '*';

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await completeCalendarEvent(event.id);
      onUpdated && onUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to complete event:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await cancelCalendarEvent(event.id);
      onUpdated && onUpdated();
      onClose();
    } catch (err) {
      console.error('Failed to cancel event:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!form.event_date || !form.event_time) {
      setError('Date and time are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await updateCalendarEvent(event.id, {
        title: form.title,
        event_type: form.event_type,
        event_date: form.event_date,
        event_time: form.event_time,
        duration_minutes: form.duration_minutes,
        description: form.description,
      });
      onUpdated && onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update event');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLead = () => {
    onClose();
    navigate('/?lead=' + event.lead_id);
  };

  const handleStartRecording = () => {
    onClose();
    navigate('/?lead=' + event.lead_id + '&record=1');
  };

  const infoRow = (rowLabel, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{rowLabel}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>{value}</span>
    </div>
  );

  const inputStyle = {
    background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
    color: 'var(--text-primary)', fontSize: '14px', colorScheme: 'dark', width: '100%',
  };

  const labelStyle = {
    display: 'block', color: 'var(--text-secondary)', fontSize: '12px',
    fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase',
  };

  const isActive = event.status === 'scheduled' || event.status === 'rescheduled';

  // ── Edit mode ──
  if (isEditing) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
            <h2>Edit Event</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}>X</button>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
              color: 'var(--color-error)', fontSize: '13px', marginBottom: 'var(--space-lg)',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>Event Type</label>
            <select value={form.event_type} onChange={(e) => handleChange('event_type', e.target.value)} style={inputStyle}>
              <option value="callback">Callback</option>
              <option value="site_visit">Site Visit</option>
              <option value="follow_up_email">Follow-Up Email</option>
              <option value="follow_up_call">Follow-Up Call</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>Title</label>
            <input type="text" value={form.title} onChange={(e) => handleChange('title', e.target.value)} style={inputStyle} placeholder="Event title..." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.event_date} onChange={(e) => handleChange('event_date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input type="time" value={form.event_time} onChange={(e) => handleChange('event_time', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={(e) => handleChange('duration_minutes', Number(e.target.value))} min={5} max={480} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Event notes..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {event.business_name && (
            <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-sm) var(--space-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Linked to: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{event.business_name}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setIsEditing(false); setError(''); }} disabled={loading}>Back</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ──
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xl)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '20px' }}>{icon}</span>
              <h2 style={{ margin: 0 }}>{event.business_name || event.title}</h2>
            </div>
            <span style={{
              background: `${color}20`, color: color,
              padding: '2px 10px', borderRadius: 'var(--radius-full)',
              fontSize: '12px', fontWeight: 500,
            }}>
              {label}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}
          >
            X
          </button>
        </div>

        {/* Details */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          {event.business_name && event.title !== event.business_name && infoRow('Title', event.title)}
          {infoRow('Date', new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}
          {infoRow('Time', event.event_time)}
          {infoRow('Duration', `${event.duration_minutes} minutes`)}
          {infoRow('Status', event.status.charAt(0).toUpperCase() + event.status.slice(1))}
          {event.business_name && infoRow('Business', event.business_name)}
          {event.phone && infoRow('Phone', event.phone)}
          {event.category && infoRow('Category', event.category)}
          {event.auto_created ? infoRow('Created', 'Auto-generated from call analysis') : infoRow('Created', 'Manually created')}
        </div>

        {/* Description */}
        {event.description && (
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)', marginBottom: 'var(--space-xl)',
          }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase' }}>Notes</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{event.description}</div>
          </div>
        )}

        {/* Actions */}
        {isActive ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
            <button className="btn btn-primary btn-sm" onClick={handleComplete} disabled={loading} style={{ background: 'var(--color-success)' }}>
              Complete
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setIsEditing(true)} disabled={loading}>
              Edit
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleCancel} disabled={loading}>
              Cancel Event
            </button>
            {event.lead_id && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={handleOpenLead}>
                  Open Lead
                </button>
                {(event.event_type === 'callback' || event.event_type === 'follow_up_call') && (
                  <button className="btn btn-ghost btn-sm" onClick={handleStartRecording}>
                    Start Recording
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {event.lead_id && (
              <button className="btn btn-ghost btn-sm" onClick={handleOpenLead}>
                Open Lead
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
