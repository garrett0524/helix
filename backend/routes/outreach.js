const express = require('express');
const { query } = require('../database/pg');

const router = express.Router();

// GET /api/outreach/queue
router.get('/queue', async (req, res) => {
  try {
    let sql = `
      SELECT oq.*, l.business_name, l.category, l.phone, l.owner_name, l.pipeline_stage
      FROM outreach_queue oq
      LEFT JOIN leads l ON oq.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (req.query.status) {
      sql += ` AND oq.status = $${paramIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.action_type) {
      sql += ` AND oq.action_type = $${paramIdx++}`;
      params.push(req.query.action_type);
    }

    sql += ' ORDER BY oq.created_at DESC';

    const { rows: items } = await query(sql, params);

    const { rows: [callsQueued] } = await query("SELECT COUNT(*) as count FROM outreach_queue WHERE status = 'queued' AND action_type = 'call'");
    const { rows: [emailsQueued] } = await query("SELECT COUNT(*) as count FROM outreach_queue WHERE status = 'queued' AND action_type = 'email'");
    const { rows: [approved] } = await query("SELECT COUNT(*) as count FROM outreach_queue WHERE status = 'approved'");

    const summary = {
      calls_queued: parseInt(callsQueued?.count || 0),
      emails_queued: parseInt(emailsQueued?.count || 0),
      approved: parseInt(approved?.count || 0),
    };

    res.json({ data: items, summary });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch queue', message: err.message });
  }
});

// POST /api/outreach/queue
router.post('/queue', async (req, res) => {
  try {
    const { lead_id, action_type, scheduled_time } = req.body;

    if (!lead_id || !action_type) {
      return res.status(400).json({ error: 'lead_id and action_type are required' });
    }

    if (!['call', 'email'].includes(action_type)) {
      return res.status(400).json({ error: 'action_type must be call or email' });
    }

    const { rows: [lead] } = await query('SELECT id FROM leads WHERE id = $1', [lead_id]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { rows: [newRow] } = await query(
      'INSERT INTO outreach_queue (lead_id, action_type, scheduled_time) VALUES ($1, $2, $3) RETURNING id',
      [lead_id, action_type, scheduled_time || null]
    );

    const { rows: [item] } = await query(`
      SELECT oq.*, l.business_name, l.category, l.phone
      FROM outreach_queue oq
      LEFT JOIN leads l ON oq.lead_id = l.id
      WHERE oq.id = $1
    `, [newRow.id]);

    res.status(201).json({ data: item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to queue', message: err.message });
  }
});

// PUT /api/outreach/queue/:id/approve
router.put('/queue/:id/approve', async (req, res) => {
  try {
    const { rows: [item] } = await query('SELECT * FROM outreach_queue WHERE id = $1', [Number(req.params.id)]);
    if (!item) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    await query(
      "UPDATE outreach_queue SET status = 'approved', approved_at = NOW()::text WHERE id = $1",
      [Number(req.params.id)]
    );

    const { rows: [updated] } = await query(`
      SELECT oq.*, l.business_name, l.category, l.phone
      FROM outreach_queue oq
      LEFT JOIN leads l ON oq.lead_id = l.id
      WHERE oq.id = $1
    `, [Number(req.params.id)]);

    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve', message: err.message });
  }
});

// POST /api/outreach/queue/approve-batch
router.post('/queue/approve-batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    let approved = 0;
    for (const id of ids) {
      const { rowCount } = await query(
        "UPDATE outreach_queue SET status = 'approved', approved_at = NOW()::text WHERE id = $1 AND status = 'queued'",
        [Number(id)]
      );
      if (rowCount > 0) approved++;
    }

    res.json({ message: `${approved} items approved`, approved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to batch approve', message: err.message });
  }
});

// PUT /api/outreach/queue/:id/reject
router.put('/queue/:id/reject', async (req, res) => {
  try {
    const { rows: [item] } = await query('SELECT * FROM outreach_queue WHERE id = $1', [Number(req.params.id)]);
    if (!item) {
      return res.status(404).json({ error: 'Queue item not found' });
    }

    await query(
      "UPDATE outreach_queue SET status = 'rejected' WHERE id = $1",
      [Number(req.params.id)]
    );

    res.json({ message: 'Item rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject', message: err.message });
  }
});

module.exports = router;
