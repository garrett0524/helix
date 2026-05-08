const express = require('express');
const { query } = require('../database/pg');

const router = express.Router();

// GET /api/stats/overview
// Phase 5: MSP-focused metrics. Returns the four tiles the StatsBar renders
// (totalMsps, contactedThisWeek, discoveryCalls, conversionRate) along with
// a by_stage breakdown that other widgets may still consume.
router.get('/overview', async (req, res) => {
  try {
    const { rows: [totalResult] } = await query('SELECT COUNT(*) as total FROM leads');
    const totalMsps = parseInt(totalResult?.total || 0);

    const { rows: stageRows } = await query(
      "SELECT pipeline_stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage"
    );
    const by_stage = {};
    for (const row of stageRows) {
      by_stage[row.pipeline_stage] = parseInt(row.count);
    }

    const { rows: [contactedResult] } = await query(`
      SELECT COUNT(*) as count
      FROM leads
      WHERE pipeline_stage IN (
        'outreach_sent', 'responded', 'discovery_call',
        'technical_review', 'contract_sent', 'onboarding', 'live'
      )
        AND updated_at >= NOW() - INTERVAL '7 days'
    `);
    const contactedThisWeek = parseInt(contactedResult?.count || 0);

    const { rows: [discoveryResult] } = await query(
      "SELECT COUNT(*) as count FROM leads WHERE pipeline_stage = 'discovery_call'"
    );
    const discoveryCalls = parseInt(discoveryResult?.count || 0);

    const { rows: [conversionResult] } = await query(`
      SELECT ROUND(
        COUNT(*) FILTER (WHERE pipeline_stage = 'live') * 100.0 / NULLIF(COUNT(*), 0)
      ) AS rate
      FROM leads
    `);
    const conversionRate = conversionResult?.rate != null ? Number(conversionResult.rate) : 0;

    res.json({
      totalMsps,
      contactedThisWeek,
      discoveryCalls,
      conversionRate,
      by_stage,
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

    // Phase 3: call_log was dropped. Phase 6 will rewire daily call counts
    // to use the recordings table.
    const callsDaily = [];

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
