const express = require('express');
const { query } = require('../database/pg');
const googleCalendar = require('../services/googleCalendar');

const router = express.Router();

// ============================================================
// Google Calendar OAuth routes (must come before /:id)
// ============================================================

// GET /api/calendar/google/auth
router.get('/google/auth', async (req, res) => {
  try {
    const authUrl = await googleCalendar.getAuthUrl();
    if (!authUrl) {
      return res.status(400).json({ error: 'Google Calendar not configured. Set client ID and secret in Settings first.' });
    }
    res.json({ data: { url: authUrl } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate auth URL', message: err.message });
  }
});

// GET /api/calendar/google/callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const tokens = await googleCalendar.exchangeCode(code);
    if (!tokens || !tokens.refresh_token) {
      return res.status(400).json({ error: 'Failed to exchange authorization code. Try disconnecting and reconnecting.' });
    }

    // Store refresh token in settings
    const { rows: [existing] } = await query('SELECT key FROM settings WHERE key = $1', ['google_refresh_token']);
    if (existing) {
      await query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2", [tokens.refresh_token, 'google_refresh_token']);
    } else {
      await query("INSERT INTO settings (key, value) VALUES ($1, $2)", ['google_refresh_token', tokens.refresh_token]);
    }

    // Redirect to frontend settings page with success
    const redirectUrl = process.env.NODE_ENV === 'production'
      ? '/settings?google_connected=true'
      : 'http://localhost:5173/settings?google_connected=true';
    res.redirect(redirectUrl);
  } catch (err) {
    res.status(500).json({ error: 'OAuth callback failed', message: err.message });
  }
});

// GET /api/calendar/google/status
router.get('/google/status', async (req, res) => {
  try {
    const connected = await googleCalendar.isConnected();
    const clientId = await googleCalendar.getSettingValue('google_client_id');
    const hasCredentials = !!clientId;
    res.json({ data: { connected, hasCredentials } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status', message: err.message });
  }
});

// POST /api/calendar/google/disconnect
router.post('/google/disconnect', async (req, res) => {
  try {
    const { rows: [existing] } = await query('SELECT key FROM settings WHERE key = $1', ['google_refresh_token']);
    if (existing) {
      await query("UPDATE settings SET value = '', updated_at = NOW() WHERE key = $1", ['google_refresh_token']);
    }
    res.json({ message: 'Google Calendar disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect', message: err.message });
  }
});

// GET /api/calendar/google/calendars
router.get('/google/calendars', async (req, res) => {
  try {
    const calendars = await googleCalendar.listCalendars();
    res.json({ data: calendars });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list calendars', message: err.message });
  }
});

// POST /api/calendar/google/sync-all
router.post('/google/sync-all', async (req, res) => {
  try {
    const connected = await googleCalendar.isConnected();
    if (!connected) {
      return res.status(400).json({ error: 'Google Calendar not connected' });
    }
    const result = await googleCalendar.syncAllEvents();
    res.json({ message: `Synced ${result.synced} of ${result.total} events`, data: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync events', message: err.message });
  }
});

// ============================================================
// Specific routes MUST come before /:id
// ============================================================

// GET /api/calendar/today
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows: events } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.event_date = $1 AND ce.status = 'scheduled'
       ORDER BY ce.event_time ASC`,
      [today]
    );
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch today events', message: err.message });
  }
});

// GET /api/calendar/upcoming
router.get('/upcoming', async (req, res) => {
  try {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    const startStr = today.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { rows: events } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.event_date >= $1 AND ce.event_date <= $2 AND ce.status IN ('scheduled', 'rescheduled')
       ORDER BY ce.event_date ASC, ce.event_time ASC`,
      [startStr, endStr]
    );
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch upcoming events', message: err.message });
  }
});

// GET /api/calendar - List events
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT ce.*, l.business_name, l.phone, l.category
      FROM calendar_events ce
      LEFT JOIN leads l ON ce.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (req.query.date_from) {
      sql += ` AND ce.event_date >= $${paramIdx++}`;
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      sql += ` AND ce.event_date <= $${paramIdx++}`;
      params.push(req.query.date_to);
    }
    if (req.query.event_type) {
      sql += ` AND ce.event_type = $${paramIdx++}`;
      params.push(req.query.event_type);
    }
    if (req.query.status) {
      sql += ` AND ce.status = $${paramIdx++}`;
      params.push(req.query.status);
    } else {
      sql += " AND ce.status NOT IN ('cancelled', 'completed')";
    }
    if (req.query.lead_id) {
      sql += ` AND ce.lead_id = $${paramIdx++}`;
      params.push(Number(req.query.lead_id));
    }

    sql += ' ORDER BY ce.event_date ASC, ce.event_time ASC';

    const { rows: events } = await query(sql, params);
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calendar events', message: err.message });
  }
});

// GET /api/calendar/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: [event] } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category, l.owner_name
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.id = $1`,
      [Number(req.params.id)]
    );
    if (!event) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }
    res.json({ data: event });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calendar event', message: err.message });
  }
});

// POST /api/calendar
router.post('/', async (req, res) => {
  try {
    const { lead_id, recording_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created } = req.body;

    if (!event_type || !title || !event_date || !event_time) {
      return res.status(400).json({ error: 'event_type, title, event_date, and event_time are required' });
    }

    const validTypes = ['callback', 'site_visit', 'follow_up_email', 'follow_up_call', 'custom'];
    if (!validTypes.includes(event_type)) {
      return res.status(400).json({ error: `event_type must be one of: ${validTypes.join(', ')}` });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return res.status(400).json({ error: 'event_date must be in YYYY-MM-DD format' });
    }

    if (!/^\d{2}:\d{2}$/.test(event_time)) {
      return res.status(400).json({ error: 'event_time must be in HH:MM format' });
    }

    const { rows: [newRow] } = await query(
      `INSERT INTO calendar_events (lead_id, recording_id, event_type, title, description, event_date, event_time, duration_minutes, auto_created)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        lead_id ? Number(lead_id) : null,
        recording_id ? Number(recording_id) : null,
        event_type,
        title,
        description || null,
        event_date,
        event_time,
        duration_minutes || 15,
        auto_created ? true : false
      ]
    );

    const { rows: [newEvent] } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.id = $1`,
      [newRow.id]
    );

    // Sync to Google Calendar (non-blocking)
    const connected = await googleCalendar.isConnected();
    if (connected) {
      googleCalendar.createGoogleEvent(newEvent).then(async (googleEventId) => {
        if (googleEventId) {
          await query('UPDATE calendar_events SET google_event_id = $1 WHERE id = $2', [googleEventId, newEvent.id]);
        }
      }).catch(err => console.error('Google sync error on create:', err.message));
    }

    res.status(201).json({ data: newEvent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create calendar event', message: err.message });
  }
});

// PUT /api/calendar/:id
router.put('/:id', async (req, res) => {
  try {
    const { rows: [event] } = await query('SELECT * FROM calendar_events WHERE id = $1', [Number(req.params.id)]);
    if (!event) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    const fields = ['lead_id', 'event_type', 'title', 'description', 'event_date', 'event_time', 'duration_minutes', 'status'];
    const updates = [];
    const params = [];
    let paramIdx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx++}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    if ((req.body.event_date || req.body.event_time) && !req.body.status) {
      if (event.status === 'scheduled') {
        updates.push(`status = $${paramIdx++}`);
        params.push('rescheduled');
      }
    }

    updates.push('updated_at = NOW()');
    params.push(Number(req.params.id));

    await query(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

    const { rows: [updatedEvent] } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.id = $1`,
      [Number(req.params.id)]
    );

    // Sync update to Google Calendar
    const connected = await googleCalendar.isConnected();
    if (connected && event.google_event_id) {
      googleCalendar.updateGoogleEvent(event.google_event_id, updatedEvent)
        .catch(err => console.error('Google sync error on update:', err.message));
    }

    res.json({ data: updatedEvent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update calendar event', message: err.message });
  }
});

// PUT /api/calendar/:id/complete
router.put('/:id/complete', async (req, res) => {
  try {
    const { rows: [event] } = await query('SELECT * FROM calendar_events WHERE id = $1', [Number(req.params.id)]);
    if (!event) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    await query(
      "UPDATE calendar_events SET status = 'completed', updated_at = NOW() WHERE id = $1",
      [Number(req.params.id)]
    );

    const { rows: [updatedEvent] } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.id = $1`,
      [Number(req.params.id)]
    );

    const connected = await googleCalendar.isConnected();
    if (connected && event.google_event_id) {
      googleCalendar.updateGoogleEventTitle(event.google_event_id, updatedEvent, '[DONE]')
        .catch(err => console.error('Google sync error on complete:', err.message));
    }

    res.json({ data: updatedEvent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete calendar event', message: err.message });
  }
});

// PUT /api/calendar/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const { rows: [event] } = await query('SELECT * FROM calendar_events WHERE id = $1', [Number(req.params.id)]);
    if (!event) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    await query(
      "UPDATE calendar_events SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [Number(req.params.id)]
    );

    const { rows: [updatedEvent] } = await query(
      `SELECT ce.*, l.business_name, l.phone, l.category
       FROM calendar_events ce
       LEFT JOIN leads l ON ce.lead_id = l.id
       WHERE ce.id = $1`,
      [Number(req.params.id)]
    );

    const connected = await googleCalendar.isConnected();
    if (connected && event.google_event_id) {
      googleCalendar.deleteGoogleEvent(event.google_event_id)
        .catch(err => console.error('Google sync error on cancel:', err.message));
    }

    res.json({ data: updatedEvent });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel calendar event', message: err.message });
  }
});

module.exports = router;
