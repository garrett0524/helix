/**
 * Apollo Enrichment Routes
 *
 * POST /enrich/:leadId       — Enrich a single lead
 * POST /enrich-bulk          — Start bulk enrichment (async, returns immediately)
 * GET  /enrich-bulk/status   — Poll progress of running bulk enrichment
 * GET  /status               — Check Apollo API key validity
 */

const express = require('express');
const { enrichLead, enrichBulk, checkStatus } = require('../services/apollo');

const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory bulk enrichment job tracker
// ---------------------------------------------------------------------------
let bulkJob = null; // { total, completed, enriched, not_found, errors, credits_used, done, error }

// POST /api/apollo/enrich/:leadId
router.post('/enrich/:leadId', async (req, res) => {
  try {
    const result = await enrichLead(Number(req.params.leadId));
    res.json({ data: result });
  } catch (err) {
    const status = err.message.includes('not configured') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/apollo/enrich-bulk
// dryRun: true  → returns preview synchronously (fast)
// dryRun: false → kicks off enrichment in the background, returns immediately
router.post('/enrich-bulk', async (req, res) => {
  try {
    const { leadIds, filter, dryRun } = req.body;

    // Dry run is synchronous — just a DB count, no Apollo calls
    if (dryRun) {
      const result = await enrichBulk({ leadIds, filter, dryRun: true });
      return res.json(result);
    }

    // Reject if a job is already running
    if (bulkJob && !bulkJob.done) {
      return res.status(409).json({
        error: 'A bulk enrichment is already in progress.',
        progress: bulkJob,
      });
    }

    // Get the preview to know how many leads we'll process
    const preview = await enrichBulk({ leadIds, filter, dryRun: true });

    // Initialize progress tracker
    bulkJob = {
      total: preview.needs_enrichment,
      already_had_email: preview.already_had_email,
      completed: 0,
      enriched: 0,
      not_found: 0,
      errors: 0,
      credits_used: 0,
      done: false,
      error: null,
      started_at: new Date().toISOString(),
    };

    // Fire and forget — run enrichment in background with progress callback
    runBulkEnrichment({ leadIds, filter }).catch(err => {
      console.error('[Apollo] Background bulk enrichment crashed:', err.message);
      if (bulkJob) {
        bulkJob.done = true;
        bulkJob.error = err.message;
      }
    });

    res.json({
      status: 'started',
      message: `Enriching ${preview.needs_enrichment} leads in background`,
      total: preview.needs_enrichment,
    });
  } catch (err) {
    const status = err.message.includes('not configured') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * Runs enrichBulk but updates bulkJob progress after each lead.
 * Uses enrichLead directly so we can track per-lead completion.
 */
async function runBulkEnrichment({ leadIds, filter }) {
  try {
    const result = await enrichBulk({
      leadIds,
      filter,
      onProgress: (stats) => {
        if (bulkJob) {
          bulkJob.completed = stats.completed;
          bulkJob.enriched = stats.enriched;
          bulkJob.not_found = stats.not_found;
          bulkJob.errors = stats.errors;
          bulkJob.credits_used = stats.credits_used;
        }
      },
    });

    if (bulkJob) {
      bulkJob.completed = bulkJob.total;
      bulkJob.enriched = result.enriched;
      bulkJob.not_found = result.not_found;
      bulkJob.errors = result.errors;
      bulkJob.credits_used = result.credits_used;
      bulkJob.done = true;
    }
  } catch (err) {
    if (bulkJob) {
      bulkJob.done = true;
      bulkJob.error = err.message;
    }
  }
}

// GET /api/apollo/enrich-bulk/status
router.get('/enrich-bulk/status', (req, res) => {
  if (!bulkJob) {
    return res.json({ done: true, message: 'No enrichment job running' });
  }
  res.json(bulkJob);
});

// GET /api/apollo/status
router.get('/status', async (req, res) => {
  try {
    const result = await checkStatus();
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
