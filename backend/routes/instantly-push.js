/**
 * Instantly Campaign Push & Sync Routes
 *
 * GET  /campaigns      — List available Instantly campaigns
 * POST /push           — Push leads to a campaign
 * POST /push-filtered  — Push filtered leads to a campaign
 * POST /sync           — Manual sync of email statuses
 */

const express = require('express');
const { getCampaigns, pushLeadsToCampaign, pushFilteredLeads } = require('../services/instantly-push');
const { syncEmailStatuses, handleWebhook } = require('../services/instantly-sync');

const router = express.Router();

// GET /api/instantly/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await getCampaigns();
    res.json({ data: campaigns });
  } catch (err) {
    const status = err.message.includes('not configured') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/instantly/push
router.post('/push', async (req, res) => {
  try {
    const { leadIds, campaignId } = req.body;
    if (!leadIds || !campaignId) {
      return res.status(400).json({ error: 'leadIds and campaignId are required' });
    }
    const result = await pushLeadsToCampaign(leadIds, campaignId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instantly/push-filtered
router.post('/push-filtered', async (req, res) => {
  try {
    const { filter, campaignId } = req.body;
    if (!filter || !campaignId) {
      return res.status(400).json({ error: 'filter and campaignId are required' });
    }
    const result = await pushFilteredLeads(filter, campaignId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instantly/sync — Manual sync of email statuses
router.post('/sync', async (req, res) => {
  try {
    const result = await syncEmailStatuses();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
