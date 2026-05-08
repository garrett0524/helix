const express = require('express');
const { query } = require('../database/pg');
const retell = require('../services/retell');

const router = express.Router();

// GET /api/calls
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT cl.*, l.business_name, l.category, l.phone, l.owner_name
      FROM call_log cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (req.query.outcome) {
      sql += ` AND cl.outcome = $${paramIdx++}`;
      params.push(req.query.outcome);
    }
    if (req.query.lead_id) {
      sql += ` AND cl.lead_id = $${paramIdx++}`;
      params.push(Number(req.query.lead_id));
    }

    sql += ' ORDER BY cl.created_at DESC';
    const { rows: calls } = await query(sql, params);
    res.json({ data: calls });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch calls', message: err.message });
  }
});

// GET /api/calls/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows: [call] } = await query(`
      SELECT cl.*, l.business_name, l.category, l.phone, l.owner_name
      FROM call_log cl
      LEFT JOIN leads l ON cl.lead_id = l.id
      WHERE cl.id = $1
    `, [Number(req.params.id)]);

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({ data: call });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch call', message: err.message });
  }
});

// POST /api/calls/trigger
router.post('/trigger', async (req, res) => {
  try {
    const { lead_id } = req.body;
    if (!lead_id) {
      return res.status(400).json({ error: 'lead_id is required' });
    }

    const { rows: [lead] } = await query('SELECT * FROM leads WHERE id = $1', [lead_id]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const callResult = await retell.makeCall({
      phone: lead.phone,
      businessName: lead.business_name,
      ownerName: lead.owner_name
    });

    const { rows: [newCall] } = await query(
      `INSERT INTO call_log (lead_id, retell_call_id, duration_seconds, outcome, transcript, recording_url, cost, callback_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        lead_id,
        callResult.retell_call_id,
        callResult.duration_seconds || 0,
        callResult.outcome || 'no_answer',
        callResult.transcript || null,
        callResult.recording_url || null,
        callResult.cost || 0,
        callResult.outcome === 'callback' ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() : null
      ]
    );

    await query(
      "UPDATE leads SET contact_attempts = contact_attempts + 1, last_contact_date = NOW()::text, last_contact_method = 'call', updated_at = NOW() WHERE id = $1",
      [lead_id]
    );

    if (callResult.outcome === 'interested' || callResult.outcome === 'callback') {
      const newStage = callResult.outcome === 'callback' ? 'meeting_booked' : 'interested';
      await query("UPDATE leads SET pipeline_stage = $1, updated_at = NOW() WHERE id = $2 AND pipeline_stage IN ('new', 'contacted')", [newStage, lead_id]);
    } else if (callResult.outcome !== 'voicemail' && callResult.outcome !== 'no_answer') {
      await query("UPDATE leads SET pipeline_stage = 'contacted', updated_at = NOW() WHERE id = $1 AND pipeline_stage = 'new'", [lead_id]);
    }

    const { rows: [callLog] } = await query('SELECT * FROM call_log WHERE id = $1', [newCall.id]);
    res.json({ data: callLog });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trigger call', message: err.message });
  }
});

// POST /api/calls/webhook
router.post('/webhook', async (req, res) => {
  try {
    const { call_id, status, transcript, recording_url, duration, outcome } = req.body;

    if (call_id) {
      const { rows: [existing] } = await query('SELECT * FROM call_log WHERE retell_call_id = $1', [call_id]);
      if (existing) {
        await query(
          'UPDATE call_log SET outcome = $1, transcript = $2, recording_url = $3, duration_seconds = $4 WHERE retell_call_id = $5',
          [outcome || existing.outcome, transcript || existing.transcript, recording_url || existing.recording_url, duration || existing.duration_seconds, call_id]
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed', message: err.message });
  }
});

module.exports = router;
