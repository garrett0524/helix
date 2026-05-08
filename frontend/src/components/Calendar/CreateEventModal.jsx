import { useState, useEffect } from 'react'
import { getLeads, createCalendarEvent } from '../../api'

export default function CreateEventModal({ onClose, onCreated, prefillDate }) {
  const [leads, setLeads] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    lead_id: '',
    event_type: 'custom',
    title: '',
    description: '',
    event_date: prefillDate || new Date().toISOString().split('T')[0],
    event_time: '14:00',
    duration_minutes: 15,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getLeads({ limit: 500 })
      .then(res => setLeads(res.data || []))
      .catch(() => {});
  }, []);

  const filteredLeads = searchTerm
    ? leads.filter(l => l.business_name.toLowerCase().includes(searchTerm.toLowerCase()))
    : leads;

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!form.event_date || !form.event_time) {
      setError('Date and time are required');
      return;
    }

    setSaving(true);
    try {
      await createCalendarEvent({
        ...form,
        lead_id: form.lead_id || null,
        auto_created: 0,
      });
      onCreated && onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  const labelStyle = {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    marginBottom: '4px',
    textTransform: 'uppercase',
  };

  const fieldGroup = {
    marginBottom: 'var(--space-lg)',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xl)' }}>
          <h2>Add Event</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: '20px', cursor: 'pointer', padding: '4px',
            }}
          >
            X
          </button>
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

        <form onSubmit={handleSubmit}>
          <div style={fieldGroup}>
            <label style={labelStyle}>Lead (optional)</label>
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ marginBottom: '4px' }}
            />
            <select
              value={form.lead_id}
              onChange={(e) => {
                handleChange('lead_id', e.target.value);
                const lead = leads.find(l => l.id === Number(e.target.value));
                if (lead && !form.title) {
                  handleChange('title', `${lead.business_name}`);
                }
              }}
            >
              <option value="">No lead (general event)</option>
              {filteredLeads.slice(0, 50).map(l => (
                <option key={l.id} value={l.id}>{l.business_name} - {l.category || 'N/A'}</option>
              ))}
            </select>
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle}>Event Type</label>
            <select value={form.event_type} onChange={(e) => handleChange('event_type', e.target.value)}>
              <option value="callback">Callback</option>
              <option value="site_visit">Site Visit</option>
              <option value="follow_up_email">Follow-Up Email</option>
              <option value="follow_up_call">Follow-Up Call</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Event title..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-md)', ...fieldGroup }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => handleChange('event_date', e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
                  color: 'var(--text-primary)', fontSize: '14px', width: '100%',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                value={form.event_time}
                onChange={(e) => handleChange('event_time', e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
                  color: 'var(--text-primary)', fontSize: '14px', width: '100%',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>Duration (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => handleChange('duration_minutes', Number(e.target.value))}
                min={5}
                max={480}
              />
            </div>
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Event notes..."
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}