const express = require('express');
const { query } = require('../database/pg');
const instantly = require('../services/instantly');

const router = express.Router();

// GET /api/emails
router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT el.*, l.business_name, l.category, l.phone, l.owner_name
      FROM email_log el
      LEFT JOIN leads l ON el.lead_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (req.query.status) {
      sql += ` AND el.status = $${paramIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.sequence_name) {
      sql += ` AND el.sequence_name = $${paramIdx++}`;
      params.push(req.query.sequence_name);
    }
    if (req.query.lead_id) {
      sql += ` AND el.lead_id = $${paramIdx++}`;
      params.push(Number(req.query.lead_id));
    }

    sql += ' ORDER BY el.sent_at DESC';

    const { rows: emails } = await query(sql, params);

    let sequences = [];
    let domains = [];
    let sequenceError = null;
    let domainError = null;

    const [seqResult, domResult] = await Promise.allSettled([
      instantly.getSequenceStatus(),
      instantly.getDomainHealth(),
    ]);

    if (seqResult.status === 'fulfilled') {
      sequences = seqResult.value.sequences || [];
      sequenceError = seqResult.value.error || null;
    } else {
      sequenceError = seqResult.reason?.message || 'Failed to fetch sequences';
    }

    if (domResult.status === 'fulfilled') {
      domains = domResult.value.domains || [];
      domainError = domResult.value.error || null;
    } else {
      domainError = domResult.reason?.message || 'Failed to fetch domain health';
    }

    res.json({
      data: emails,
      sequences,
      domains,
      errors: {
        sequences: sequenceError,
        domains: domainError,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emails', message: err.message });
  }
});

// POST /api/emails/webhook
router.post('/webhook', async (req, res) => {
  try {
    const { message_id, event, timestamp } = req.body;

    if (message_id) {
      const { rows: [existing] } = await query('SELECT * FROM email_log WHERE instantly_message_id = $1', [message_id]);
      if (existing) {
        if (event === 'opened') {
          await query("UPDATE email_log SET status = 'opened', opened_at = $1 WHERE instantly_message_id = $2", [timestamp || new Date().toISOString(), message_id]);
        } else if (event === 'replied') {
          await query("UPDATE email_log SET status = 'replied', replied_at = $1 WHERE instantly_message_id = $2", [timestamp || new Date().toISOString(), message_id]);
        } else if (event === 'bounced') {
          await query("UPDATE email_log SET status = 'bounced' WHERE instantly_message_id = $1", [message_id]);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed', message: err.message });
  }
});

module.exports = router;
