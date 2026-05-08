const express = require('express');
const { query } = require('../database/pg');

const router = express.Router();

// Note: requireAdmin is applied at the server.js level for all /api/settings routes

// Default settings
const DEFAULT_SETTINGS = {
  retell_api_key: '',
  retell_voice_id: '',
  instantly_api_key: '',
  apollo_api_key: '',
  scraper_default_radius: '10',
  scraper_default_geography: 'Long Island, NY',
  scraper_categories: 'bars,restaurants,gyms,fitness centers',
  notification_email: '',
  notification_sms: '',
  anthropic_api_key: '',
  anthropic_model: 'haiku',
  whisper_model_size: 'base',
  auto_apply_ai_suggestions: 'false',
  google_client_id: '',
  google_client_secret: '',
  google_refresh_token: '',
  google_calendar_id: 'primary',
};

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT key, value FROM settings');
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json({ data: settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', message: err.message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Request body must be a settings object' });
    }

    const allowedKeys = Object.keys(DEFAULT_SETTINGS);

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;

      const { rows: [existing] } = await query('SELECT key FROM settings WHERE key = $1', [key]);
      if (existing) {
        await query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2", [String(value), key]);
      } else {
        await query("INSERT INTO settings (key, value) VALUES ($1, $2)", [key, String(value)]);
      }
    }

    const { rows } = await query('SELECT key, value FROM settings');
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json({ message: 'Settings updated', data: settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings', message: err.message });
  }
});

module.exports = router;
