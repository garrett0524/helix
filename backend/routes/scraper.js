const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

// Note: requireAdmin is applied at the server.js level for all /api/scraper routes

const router = express.Router();

// In-memory job tracker
let currentJob = null;
const jobHistory = [];

// POST /api/scraper/run
router.post('/run', (req, res) => {
  try {
    const { category, geography, keywords, radius } = req.body;

    if (currentJob && currentJob.status === 'running') {
      return res.status(409).json({ error: 'A scrape job is already running' });
    }

    const jobId = `scrape_${Date.now()}`;
    currentJob = {
      id: jobId,
      category: category || 'restaurants',
      geography: geography || 'Long Island, NY',
      keywords: keywords || '',
      radius: radius || 10,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null,
      leads_found: 0,
      leads_imported: 0,
      leads_skipped: 0,
      error: null
    };

    const scraperPath = path.join(__dirname, '..', '..', 'scraper', 'google_maps_scraper.py');
    const args = [
      scraperPath,
      '--category', category || 'restaurants',
      '--geography', geography || 'Long Island, NY',
      '--radius', String(radius || 10)
    ];

    try {
      const proc = spawn('python', args, { cwd: path.join(__dirname, '..', '..', 'scraper') });
      let output = '';

      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const result = JSON.parse(lastLine);
            currentJob.leads_found = result.found || 0;
            currentJob.leads_imported = result.imported || 0;
            currentJob.leads_skipped = result.skipped || 0;
          } catch (e) {
            // Scraper output wasn't JSON
          }
          currentJob.status = 'completed';
        } else {
          currentJob.status = 'failed';
          currentJob.error = `Scraper exited with code ${code}`;
        }
        currentJob.completed_at = new Date().toISOString();
        jobHistory.unshift({ ...currentJob });
      });

      proc.on('error', () => {
        currentJob.status = 'completed';
        currentJob.completed_at = new Date().toISOString();
        currentJob.error = 'Scraper script not available. Use CSV import as fallback.';
        jobHistory.unshift({ ...currentJob });
      });
    } catch (spawnErr) {
      currentJob.status = 'completed';
      currentJob.completed_at = new Date().toISOString();
      currentJob.error = 'Could not start scraper. Use CSV import as fallback.';
      jobHistory.unshift({ ...currentJob });
    }

    res.json({ message: 'Scrape job started', job: currentJob });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start scraper', message: err.message });
  }
});

// GET /api/scraper/status
router.get('/status', (req, res) => {
  res.json({
    status: currentJob ? currentJob.status : 'idle',
    job: currentJob
  });
});

// GET /api/scraper/history
router.get('/history', (req, res) => {
  res.json({ data: jobHistory });
});

module.exports = router;
