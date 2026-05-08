const express = require('express');
const { query } = require('../database/pg');

const router = express.Router();

// GET /api/stats/overview
router.get('/overview', async (req, res) => {
  try {
    const { rows: [totalResult] } = await query('SELECT COUNT(*) as total FROM leads');
    const total_leads = parseInt(totalResult?.total || 0);

    const { rows: stageRows } = await query("SELECT pipeline_stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage");
    const by_stage = {};
    for (const row of stageRows) {
      by_stage[row.pipeline_stage] = parseInt(row.count);
    }

    const { rows: [contactedResult] } = await query("SELECT COUNT(*) as count FROM leads WHERE last_contact_date >= CURRENT_DATE::text");
    const contacted_today = parseInt(contactedResult?.count || 0);

    const { rows: [meetingsResult] } = await query("SELECT COUNT(*) as count FROM leads WHERE pipeline_stage = 'meeting_booked' AND updated_at >= NOW() - INTERVAL '7 days'");
    const meetings_this_week = parseInt(meetingsResult?.count || 0);

    const conversion_rate = total_leads > 0
      ? ((by_stage['meeting_booked'] || 0) + (by_stage['closed'] || 0)) / total_leads * 100
      : 0;

    const { rows: [costResult] } = await query('SELECT COALESCE(SUM(cost), 0) as total_cost FROM call_log');
    const total_call_cost = parseFloat(costResult?.total_cost || 0);

    const { rows: [callCountResult] } = await query('SELECT COUNT(*) as count FROM call_log');
    const { rows: [emailCountResult] } = await query('SELECT COUNT(*) as count FROM email_log');

    res.json({
      total_leads,
      by_stage,
      contacted_today,
      meetings_this_week,
      conversion_rate: Math.round(conversion_rate * 10) / 10,
      total_call_cost: Math.round(total_call_cost * 100) / 100,
      total_calls: parseInt(callCountResult?.count || 0),
      total_emails: parseInt(emailCountResult?.count || 0)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats', message: err.message });
  }
});

// GET /api/stats/daily
router.get('/daily', async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;

    const { rows: leadsDaily } = await query(`
      SELECT DATE(created_at) as day, COUNT(*) as leads_added
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [days]);

    const { rows: contactsDaily } = await query(`
      SELECT last_contact_date as day, COUNT(*) as contacts_made
      FROM leads
      WHERE last_contact_date >= (CURRENT_DATE - $1)::text
      GROUP BY last_contact_date
      ORDER BY day
    `, [days]);

    const { rows: callsDaily } = await query(`
      SELECT DATE(created_at) as day, COUNT(*) as calls_placed
      FROM call_log
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [days]);

    const dailyMap = {};
    for (const row of leadsDaily) {
      const day = row.day instanceof Date ? row.day.toISOString().split('T')[0] : String(row.day);
      if (!dailyMap[day]) dailyMap[day] = { day, leads_added: 0, contacts_made: 0, calls_placed: 0, emails_sent: 0 };
      dailyMap[day].leads_added = parseInt(row.leads_added);
    }
    for (const row of contactsDaily) {
      const day = row.day instanceof Date ? row.day.toISOString().split('T')[0] : String(row.day);
      if (!dailyMap[day]) dailyMap[day] = { day, leads_added: 0, contacts_made: 0, calls_placed: 0, emails_sent: 0 };
      dailyMap[day].contacts_made = parseInt(row.contacts_made);
    }
    for (const row of callsDaily) {
      const day = row.day instanceof Date ? row.day.toISOString().split('T')[0] : String(row.day);
      if (!dailyMap[day]) dailyMap[day] = { day, leads_added: 0, contacts_made: 0, calls_placed: 0, emails_sent: 0 };
      dailyMap[day].calls_placed = parseInt(row.calls_placed);
    }

    const data = Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily stats', message: err.message });
  }
});

module.exports = router;
