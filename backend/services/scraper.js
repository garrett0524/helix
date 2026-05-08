/**
 * Scraper Service
 *
 * Manages interaction with the Python Google Maps scraper.
 * For MVP, this mainly handles job tracking.
 * The actual scraping logic is in scraper/google_maps_scraper.py
 */

const { spawn } = require('child_process');
const path = require('path');

const SCRAPER_PATH = path.join(__dirname, '..', '..', 'scraper', 'google_maps_scraper.py');

/**
 * Run the Python scraper as a child process
 * @param {Object} params
 * @param {string} params.category
 * @param {string} params.geography
 * @param {number} params.radius
 * @returns {Promise<Object>} Scrape results
 */
async function runScraper({ category, geography, radius }) {
  return new Promise((resolve, reject) => {
    const args = [
      SCRAPER_PATH,
      '--category', category || 'restaurants',
      '--geography', geography || 'Long Island, NY',
      '--radius', String(radius || 10),
      '--output', 'api'
    ];

    const proc = spawn('python', args, {
      cwd: path.join(__dirname, '..', '..', 'scraper')
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const lines = stdout.trim().split('\n');
          const result = JSON.parse(lines[lines.length - 1]);
          resolve(result);
        } catch (e) {
          resolve({ found: 0, imported: 0, skipped: 0, note: 'Could not parse output' });
        }
      } else {
        reject(new Error(`Scraper exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start scraper: ${err.message}`));
    });
  });
}

module.exports = {
  runScraper
};
