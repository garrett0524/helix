const { query } = require('../database/pg');

const GCAL_COLOR_MAP = {
  callback: '9',
  site_visit: '10',
  follow_up_email: '5',
  follow_up_call: '6',
  custom: '3',
};

const EVENT_TYPE_LABELS = {
  callback: 'Callback',
  site_visit: 'Site Visit',
  follow_up_email: 'Follow-Up Email',
  follow_up_call: 'Follow-Up Call',
  custom: 'Custom',
};

async function getOAuth2Client() {
  let google;
  try {
    google = require('googleapis').google;
  } catch (err) {
    console.warn('googleapis package not installed. Google Calendar sync disabled.');
    return null;
  }

  const clientId = await getSettingValue('google_client_id');
  const clientSecret = await getSettingValue('google_client_secret');
  const refreshToken = await getSettingValue('google_refresh_token');

  if (!clientId || !clientSecret) {
    return null;
  }

  const redirectUri = process.env.NODE_ENV === 'production'
    ? `${process.env.APP_URL || 'http://localhost:3001'}/api/calendar/google/callback`
    : 'http://localhost:3001/api/calendar/google/callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return oauth2Client;
}

async function getSettingValue(key) {
  const { rows: [row] } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : '';
}

async function getCalendarApi() {
  let google;
  try {
    google = require('googleapis').google;
  } catch (err) {
    return null;
  }

  const auth = await getOAuth2Client();
  const refreshToken = await getSettingValue('google_refresh_token');
  if (!auth || !refreshToken) {
    return null;
  }

  return google.calendar({ version: 'v3', auth });
}

function buildEventTitle(event, prefix) {
  const typeLabel = EVENT_TYPE_LABELS[event.event_type] || 'Event';
  const name = event.business_name || event.title;
  const base = `${typeLabel} - ${name}`;
  return prefix ? `${prefix} ${base}` : base;
}

async function buildEventBody(event) {
  const calendarId = await getSettingValue('google_calendar_id') || 'primary';
  const lines = [];
  if (event.description) lines.push(event.description);
  if (event.phone) lines.push(`Phone: ${event.phone}`);
  if (event.category) lines.push(`Category: ${event.category}`);
  lines.push('');
  lines.push('Created by TesseraFlow');

  const startDateTime = `${event.event_date}T${event.event_time}:00`;
  const durationMs = (event.duration_minutes || 15) * 60 * 1000;
  const endDate = new Date(new Date(startDateTime).getTime() + durationMs);
  const endDateTime = endDate.toISOString();

  return {
    calendarId,
    requestBody: {
      summary: buildEventTitle(event),
      description: lines.join('\n'),
      start: { dateTime: startDateTime, timeZone: 'America/New_York' },
      end: { dateTime: endDateTime, timeZone: 'America/New_York' },
      colorId: GCAL_COLOR_MAP[event.event_type] || '3',
    },
  };
}

async function createGoogleEvent(event) {
  const calendar = await getCalendarApi();
  if (!calendar) return null;

  try {
    const { calendarId, requestBody } = await buildEventBody(event);
    const response = await calendar.events.insert({ calendarId, requestBody });
    return response.data.id;
  } catch (err) {
    console.error('Google Calendar create error:', err.message);
    return null;
  }
}

async function updateGoogleEvent(googleEventId, event) {
  const calendar = await getCalendarApi();
  if (!calendar || !googleEventId) return false;

  try {
    const { calendarId, requestBody } = await buildEventBody(event);
    await calendar.events.update({ calendarId, eventId: googleEventId, requestBody });
    return true;
  } catch (err) {
    console.error('Google Calendar update error:', err.message);
    return false;
  }
}

async function updateGoogleEventTitle(googleEventId, event, prefix) {
  const calendar = await getCalendarApi();
  if (!calendar || !googleEventId) return false;

  try {
    const calendarId = await getSettingValue('google_calendar_id') || 'primary';
    await calendar.events.patch({
      calendarId, eventId: googleEventId,
      requestBody: { summary: buildEventTitle(event, prefix) },
    });
    return true;
  } catch (err) {
    console.error('Google Calendar title update error:', err.message);
    return false;
  }
}

async function deleteGoogleEvent(googleEventId) {
  const calendar = await getCalendarApi();
  if (!calendar || !googleEventId) return false;

  try {
    const calendarId = await getSettingValue('google_calendar_id') || 'primary';
    await calendar.events.delete({ calendarId, eventId: googleEventId });
    return true;
  } catch (err) {
    console.error('Google Calendar delete error:', err.message);
    return false;
  }
}

async function listCalendars() {
  const calendar = await getCalendarApi();
  if (!calendar) return [];

  try {
    const response = await calendar.calendarList.list();
    return (response.data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
    }));
  } catch (err) {
    console.error('Google Calendar list error:', err.message);
    return [];
  }
}

async function getAuthUrl() {
  const auth = await getOAuth2Client();
  if (!auth) return null;

  const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'];
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function exchangeCode(code) {
  const auth = await getOAuth2Client();
  if (!auth) return null;

  try {
    const { tokens } = await auth.getToken(code);
    return tokens;
  } catch (err) {
    console.error('Google OAuth token exchange error:', err.message);
    return null;
  }
}

async function isConnected() {
  const refreshToken = await getSettingValue('google_refresh_token');
  const clientId = await getSettingValue('google_client_id');
  const clientSecret = await getSettingValue('google_client_secret');
  return !!(refreshToken && clientId && clientSecret);
}

async function syncAllEvents() {
  const calendar = await getCalendarApi();
  if (!calendar) return { synced: 0, errors: 0 };

  const { rows: events } = await query(
    `SELECT ce.*, l.business_name, l.phone, l.category
     FROM calendar_events ce
     LEFT JOIN leads l ON ce.lead_id = l.id
     WHERE ce.status IN ('scheduled', 'rescheduled') AND (ce.google_event_id IS NULL OR ce.google_event_id = '')
     ORDER BY ce.event_date ASC`
  );

  let synced = 0;
  let errors = 0;

  for (const event of events) {
    const googleEventId = await createGoogleEvent(event);
    if (googleEventId) {
      await query('UPDATE calendar_events SET google_event_id = $1 WHERE id = $2', [googleEventId, event.id]);
      synced++;
    } else {
      errors++;
    }
  }

  return { synced, errors, total: events.length };
}

module.exports = {
  createGoogleEvent,
  updateGoogleEvent,
  updateGoogleEventTitle,
  deleteGoogleEvent,
  listCalendars,
  getAuthUrl,
  exchangeCode,
  isConnected,
  syncAllEvents,
  getSettingValue,
};
